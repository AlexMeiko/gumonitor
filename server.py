#!/usr/bin/env python3
"""
v30 Monitor — 运行在 LG V30 (postmarketOS) 上的设备遥测 Web 服务。

设计原则：
  * 纯 Python 标准库，零第三方依赖（设备上只有 python3 + apk，装包很麻烦）。
  * 采集线程每 INTERVAL 秒采一次样，写入环形历史（默认 300 点 = 5 分钟），
    供前端画折线图；HTTP 线程只读快照，互不阻塞。
  * 所有指标都来自 /proc、/sys，不调用任何外部命令（唯一的例外是后台每 30 秒
    数一次 systemd 运行中的服务数量）。

用法：
    python3 server.py                 # 默认监听 0.0.0.0:8090
    V30_PORT=9000 python3 server.py   # 换端口
"""

from __future__ import annotations

import json
import os
import re
import socket
import subprocess
import threading
import time
from collections import deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
STATIC_DIR = os.path.join(BASE_DIR, "static")

HOST = os.environ.get("V30_HOST", "0.0.0.0")
PORT = int(os.environ.get("V30_PORT", "8090"))
INTERVAL = float(os.environ.get("V30_INTERVAL", "1.0"))
HISTORY = int(os.environ.get("V30_HISTORY", "300"))  # 采样点数量（1s × 300 = 5 分钟）

CLK_TCK = os.sysconf("SC_CLK_TCK")
PAGE_SIZE = os.sysconf("SC_PAGESIZE")
NR_CORES = os.cpu_count() or 1

# 应用层建议阈值（详情页里作为虚线画出来，与内核 trip point 分开呈现）
TEMP_WARNING = 65.0
TEMP_CRITICAL = 80.0
CPU_WARNING = 80.0
CPU_CRITICAL = 95.0

# 存储 I/O 盯的是**物理盘** sda（UFS）。注意 / 挂在 loop0 上，而 loop0 的
# backing_file 是 /dev/sda18 —— 所有 I/O 最终都落到 sda，所以只统计 sda，
# 不把 loop0 也加进来（那会重复计数）。
DISK_DEV = os.environ.get("V30_DISK", "sda")
# WiFi 走 nmcli（子进程，实测约 30ms），必须低频采样并缓存
WIFI_EVERY = float(os.environ.get("V30_WIFI_EVERY", "10.0"))

# 需要进历史的序列：key -> 单位
SERIES_KEYS = [
    "cpu", "temp", "mem", "disk", "rx", "tx", "power", "batt", "batt_cur", "load",
    "io_r", "io_w", "retx",
    # power = 整机功耗，batt_pow = 电池端功率（两者插电时能差两个数量级，
    # 详情页把它们画在同一张图上对比）
    "batt_pow",
] + [f"core{i}" for i in range(min(NR_CORES, 8))]


# --------------------------------------------------------------------------- #
# 底层读取工具
# --------------------------------------------------------------------------- #

def read_text(path: str, default: str | None = None) -> str | None:
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            return fh.read().strip()
    except OSError:
        return default


def read_int(path: str, default: int = 0) -> int:
    raw = read_text(path)
    if raw is None:
        return default
    try:
        return int(float(raw.split()[0]))
    except (ValueError, IndexError):
        return default


def human_bytes(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if abs(n) < 1024 or unit == "TB":
            return f"{n:.1f} {unit}" if unit != "B" else f"{int(n)} B"
        n /= 1024.0
    return f"{n:.1f} TB"


def fmt_duration(seconds: float) -> str:
    seconds = int(seconds)
    days, rem = divmod(seconds, 86400)
    hours, rem = divmod(rem, 3600)
    minutes = rem // 60
    if days:
        return f"{days}d {hours}h"
    if hours:
        return f"{hours}h {minutes}m"
    return f"{minutes}m"


# --------------------------------------------------------------------------- #
# 各指标采集
# --------------------------------------------------------------------------- #

def sample_cpu_stat() -> dict[str, tuple[int, int]]:
    """返回 {'cpu': (total, idle), 'cpu0': (...), ...}，单位 jiffies。"""
    out: dict[str, tuple[int, int]] = {}
    try:
        with open("/proc/stat", "r", encoding="utf-8") as fh:
            for line in fh:
                if not line.startswith("cpu"):
                    break
                parts = line.split()
                vals = [int(x) for x in parts[1:9]]
                while len(vals) < 8:
                    vals.append(0)
                idle = vals[3] + vals[4]          # idle + iowait
                total = sum(vals)
                out[parts[0]] = (total, idle)
    except OSError:
        pass
    return out


def cpu_usage(prev: tuple[int, int], cur: tuple[int, int]) -> float:
    dt = cur[0] - prev[0]
    di = cur[1] - prev[1]
    if dt <= 0:
        return 0.0
    return max(0.0, min(100.0, 100.0 * (dt - di) / dt))


def sample_cpufreq() -> dict:
    """从 cpufreq policy 目录读频率；返回总体 + 每个核心的信息。"""
    policies = []
    base = "/sys/devices/system/cpu/cpufreq"
    try:
        names = sorted(
            (d for d in os.listdir(base) if d.startswith("policy")),
            key=_trailing_number,
        )
    except OSError:
        return {"cores": [], "policies": [], "cur_mhz": 0, "max_mhz": 0, "governor": "-"}

    core_map: dict[int, dict] = {}
    for name in names:
        p = os.path.join(base, name)
        cur_khz = read_int(os.path.join(p, "scaling_cur_freq"))
        max_khz = read_int(os.path.join(p, "cpuinfo_max_freq")) or read_int(
            os.path.join(p, "scaling_max_freq")
        )
        min_khz = read_int(os.path.join(p, "cpuinfo_min_freq")) or read_int(
            os.path.join(p, "scaling_min_freq")
        )
        gov = read_text(os.path.join(p, "scaling_governor"), "-") or "-"
        affected = [
            int(x) for x in (read_text(os.path.join(p, "affected_cpus"), "") or "").split()
            if x.isdigit()
        ]
        entry = {
            "policy": name,
            "cur_khz": cur_khz,
            "max_khz": max_khz,
            "min_khz": min_khz,
            "governor": gov,
            "cores": affected,
            "cur_mhz": round(cur_khz / 1000),
            "max_mhz": round(max_khz / 1000),
        }
        policies.append(entry)
        for c in affected:
            core_map[c] = entry

    return {
        "policies": policies,
        "core_map": core_map,
        "cur_mhz": max((p["cur_mhz"] for p in policies), default=0),
        "max_mhz": max((p["max_mhz"] for p in policies), default=0),
        "governor": ", ".join(sorted({p["governor"] for p in policies})) or "-",
    }


def _trailing_number(name: str) -> int:
    digits = ""
    for ch in reversed(name):
        if ch.isdigit():
            digits = ch + digits
        else:
            break
    return int(digits) if digits else 0


def sample_thermal() -> dict:
    zones = []
    base = "/sys/class/thermal"
    try:
        entries = sorted(
            (d for d in os.listdir(base) if d.startswith("thermal_zone")),
            key=_trailing_number,
        )
    except OSError:
        return {"zones": [], "soc": None, "battery": None, "trips": []}

    for name in entries:
        z = os.path.join(base, name)
        ztype = read_text(os.path.join(z, "type"), name) or name
        milli = read_int(os.path.join(z, "temp"), -1)
        if milli < 0:
            continue
        trips = []
        for i in range(4):
            t = read_int(os.path.join(z, f"trip_point_{i}_temp"), -1)
            kind = read_text(os.path.join(z, f"trip_point_{i}_type"))
            if t > 0 and kind:
                trips.append({"type": kind, "celsius": round(t / 1000.0, 1)})
        zones.append(
            {
                "name": name,
                "type": ztype,
                "celsius": round(milli / 1000.0, 1),
                "trips": trips,
            }
        )

    soc = next((z for z in zones if "battery" not in z["type"].lower()), None)
    batt = next((z for z in zones if "battery" in z["type"].lower()), None)
    return {
        "zones": zones,
        "soc": soc,
        "battery": batt,
        "trips": (soc or {}).get("trips", []),
    }


def sample_memory() -> dict:
    info: dict[str, int] = {}
    try:
        with open("/proc/meminfo", "r", encoding="utf-8") as fh:
            for line in fh:
                key, _, rest = line.partition(":")
                val = rest.strip().split()
                if val and val[0].isdigit():
                    info[key] = int(val[0]) * 1024  # kB -> B
    except OSError:
        pass

    total = info.get("MemTotal", 0)
    avail = info.get("MemAvailable", info.get("MemFree", 0))
    used = max(0, total - avail)
    swap_total = info.get("SwapTotal", 0)
    swap_free = info.get("SwapFree", 0)
    return {
        "total": total,
        "available": avail,
        "used": used,
        "free": info.get("MemFree", 0),
        "cached": info.get("Cached", 0) + info.get("SReclaimable", 0),
        "buffers": info.get("Buffers", 0),
        "shmem": info.get("Shmem", 0),
        "slab": info.get("Slab", 0),
        "swap_total": swap_total,
        "swap_used": max(0, swap_total - swap_free),
        "percent": round(100.0 * used / total, 1) if total else 0.0,
    }


def sample_disk() -> dict:
    mounts = []
    for path, label in (("/", "System"), ("/boot", "Boot"), ("/data", "Data")):
        try:
            st = os.statvfs(path)
        except OSError:
            continue
        total = st.f_blocks * st.f_frsize
        free = st.f_bavail * st.f_frsize
        used = total - st.f_bfree * st.f_frsize
        if total <= 0:
            continue
        mounts.append(
            {
                "path": path,
                "label": label,
                "total": total,
                "used": used,
                "free": free,
                "percent": round(100.0 * used / total, 1),
            }
        )
    root = mounts[0] if mounts else {
        "path": "/", "label": "System", "total": 0, "used": 0, "free": 0, "percent": 0.0,
    }
    return {"mounts": mounts, "root": root}


def sample_network() -> dict:
    ifaces: dict[str, tuple[int, int]] = {}
    try:
        with open("/proc/net/dev", "r", encoding="utf-8") as fh:
            for line in fh:
                if ":" not in line:
                    continue
                name, _, rest = line.partition(":")
                name = name.strip()
                cols = rest.split()
                if len(cols) < 9:
                    continue
                ifaces[name] = (int(cols[0]), int(cols[8]))  # rx_bytes, tx_bytes
    except OSError:
        pass

    primary = "wlan0" if "wlan0" in ifaces else next(
        (n for n in ifaces if n != "lo"), "lo"
    )

    # 本机 IP：UDP connect 不发包，只是让内核挑一条默认路由、把源地址写进 socket。
    # 用 TEST-NET-3（文档保留地址）避免硬编码任何真实网关。
    ip = "-"
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("203.0.113.1", 53))
            ip = s.getsockname()[0]
        finally:
            s.close()
    except OSError:
        pass

    return {"ifaces": ifaces, "primary": primary, "ip": ip}


def sample_battery() -> dict:
    base = "/sys/class/power_supply/battery"
    charger = "/sys/class/power_supply/pmi8998-charger"
    capacity = read_int(os.path.join(base, "capacity"), -1)
    status = read_text(os.path.join(base, "status"), "Unknown") or "Unknown"
    voltage_uv = read_int(os.path.join(base, "voltage_now"))
    current_ua = read_int(os.path.join(base, "current_now"))
    temp_dc = read_int(os.path.join(base, "temp"), -999)
    health = (read_text(os.path.join(base, "health"))
              or read_text(os.path.join(charger, "health"))
              or "Unknown")
    tech = read_text(os.path.join(base, "technology"), "-") or "-"
    full_uah = read_int(os.path.join(base, "charge_full_design"))
    charger_type = read_text(os.path.join(charger, "type"), "-") or "-"
    charger_status = read_text(os.path.join(charger, "status"), "Unknown") or "Unknown"

    voltage = voltage_uv / 1_000_000.0 if voltage_uv else 0.0
    current = current_ua / 1_000_000.0 if current_ua else 0.0

    # 方向约定：**输入（充电）为正，输出（放电）为负**。
    # 驱动（pmi8998-fg）的 current_now 在放电时读数是正的，所以这里按 status 重新定符号，
    # 不直接信任原始符号，避免不同 PMIC 约定不一致。
    status_l = status.lower()
    if status_l.startswith("charg") or status_l == "full":
        direction, sign = "in", 1.0
    elif status_l.startswith("discharg") or status_l.startswith("not charg"):
        direction, sign = "out", -1.0
    else:
        direction, sign = "idle", (1.0 if current >= 0 else -1.0)

    current_signed = sign * abs(current)
    power_signed = sign * abs(voltage * current)
    return {
        "present": capacity >= 0,
        "capacity": capacity if capacity >= 0 else 0,
        "status": status,
        "charging": direction == "in",
        "direction": direction,
        "voltage": round(voltage, 3),
        "current": round(current, 3),
        "current_ma": round(current * 1000, 1),                 # 驱动原始值
        "current_ma_signed": round(current_signed * 1000, 1),   # 正=充入，负=放出
        "power": round(power_signed, 3),                        # 正=充入，负=放出
        "power_abs": round(abs(voltage * current), 3),
        "temp": round(temp_dc / 10.0, 1) if temp_dc > -100 else None,
        "health": health,
        "technology": tech,
        "design_capacity_mah": round(full_uah / 1000.0) if full_uah else None,
        "charger_type": charger_type,
        "charger_status": charger_status,
    }


def sample_diskstats() -> dict:
    """/proc/diskstats 的**累计值**（扇区按 512B 计，时间是 ms）。"""
    out: dict[str, dict] = {}
    try:
        with open("/proc/diskstats", "r", encoding="utf-8") as fh:
            for line in fh:
                cols = line.split()
                if len(cols) < 14:
                    continue
                try:
                    out[cols[2]] = {
                        "reads": int(cols[3]),
                        "sectors_read": int(cols[5]),
                        "writes": int(cols[7]),
                        "sectors_written": int(cols[9]),
                        "io_ms": int(cols[12]),     # 花在 I/O 上的时间 → 算繁忙度
                    }
                except ValueError:
                    continue
    except OSError:
        pass
    return out


def disk_model(dev: str) -> str:
    return (read_text(f"/sys/block/{dev}/device/model") or dev).strip()


def sample_snmp_tcp() -> dict:
    """/proc/net/snmp 里 Tcp: 那一行的累计计数（重传、建连、错误…）。"""
    keys: list[str] = []
    try:
        with open("/proc/net/snmp", "r", encoding="utf-8") as fh:
            for line in fh:
                parts = line.split()
                if not parts or parts[0] != "Tcp:":
                    continue
                if not keys:
                    keys = parts[1:]
                else:
                    return {
                        k: (int(v) if v.lstrip("-").isdigit() else 0)
                        for k, v in zip(keys, parts[1:])
                    }
    except OSError:
        pass
    return {}


def sample_iface_stats(iface: str) -> dict:
    base = f"/sys/class/net/{iface}"
    def num(name: str) -> int:
        return read_int(os.path.join(base, "statistics", name), 0)
    return {
        "rx_errors": num("rx_errors"),
        "rx_dropped": num("rx_dropped"),
        "rx_crc_errors": num("rx_crc_errors"),
        "tx_errors": num("tx_errors"),
        "tx_dropped": num("tx_dropped"),
        "link_down": read_int(os.path.join(base, "carrier_down_count"), 0),
        "link_changes": read_int(os.path.join(base, "carrier_changes"), 0),
    }


def sample_wifi(iface: str = "wlan0") -> dict | None:
    """当前连接的 AP 信息。nmcli 一次约 30ms，只在 Collector 里低频调用。

    注意 `--rescan no`：不带的话每次调用都会触发一次主动扫描（又慢又费电）。
    内核没编 WEXT，所以 wlan0 没有 wireless extensions，只能走 nmcli。
    """
    try:
        res = subprocess.run(
            ["nmcli", "-t", "-f", "IN-USE,SSID,SIGNAL,FREQ,RATE,CHAN,BSSID",
             "dev", "wifi", "list", "--rescan", "no"],
            capture_output=True, text=True, timeout=3,
        )
    except (OSError, subprocess.SubprocessError):
        return None
    for line in res.stdout.splitlines():
        if not line.strip():
            continue
        cols = re.split(r"(?<!\\):", line)
        if len(cols) < 6 or cols[0] != "*":      # 只看当前连着的那个（首列 *）
            continue
        try:
            signal = int(cols[2])
        except ValueError:
            continue
        return {
            "ssid": cols[1],
            "signal": signal,
            "freq": cols[3],
            "rate": cols[4],
            "channel": cols[5],
            "bssid": cols[6].replace("\\:", ":") if len(cols) > 6 else "",
        }
    return None


def bracket_choice(raw: str | None, default: str = "-") -> str:
    """sysfs 里有些属性写成 'auto [inhibit-charge]' —— 方括号里的是当前生效值。"""
    if not raw:
        return default
    m = re.search(r"\[([^\]]+)\]", raw)
    if m:
        return m.group(1)
    parts = raw.split()
    return parts[0] if parts else default


def sample_charger() -> dict:
    base = "/sys/class/power_supply/pmi8998-charger"
    if not os.path.exists(base):
        return {"present": False}
    behaviour = bracket_choice(read_text(os.path.join(base, "charge_behaviour")), "auto")
    return {
        "present": True,
        "online": read_int(os.path.join(base, "online"), 0) == 1,
        "status": read_text(os.path.join(base, "status"), "-") or "-",
        "health": read_text(os.path.join(base, "health"), "-") or "-",
        "usb_type": bracket_choice(read_text(os.path.join(base, "usb_type")), "Unknown"),
        "current_max_ma": round(read_int(os.path.join(base, "current_max")) / 1000.0),
        "current_now_ma": round(read_int(os.path.join(base, "current_now")) / 1000.0),
        "voltage": round(read_int(os.path.join(base, "voltage_now")) / 1_000_000.0, 3),
        "behaviour": behaviour,
        # 插着电却不充电，通常就是这里被设成了 inhibit-charge
        "inhibited": behaviour == "inhibit-charge",
    }


def sample_zram() -> dict | None:
    """/sys/block/zram0/mm_stat：orig_data_size compr_data_size mem_used_total …"""
    raw = read_text("/sys/block/zram0/mm_stat")
    if not raw:
        return None
    cols = raw.split()
    if len(cols) < 3:
        return None
    try:
        orig, compr, used = int(cols[0]), int(cols[1]), int(cols[2])
    except ValueError:
        return None
    return {
        "orig": orig,
        "compr": compr,
        "mem_used": used,
        "ratio": round(orig / compr, 2) if compr else 0.0,
        "saved": max(0, orig - compr),
        "disksize": read_int("/sys/block/zram0/disksize", 0),
        "algorithm": bracket_choice(read_text("/sys/block/zram0/comp_algorithm"), "-"),
    }


def sample_iio_input_power() -> dict:
    """充电**输入侧**功率：rradc 的 usbin_v × usbin_i。

    这是 VBUS 上的总输入（供系统 + 给电池充电），所以
        整机功耗 ≈ max(0, 输入功率 − 充入电池的功率) + 电池放出的功率
    只有插着电时才有意义（拔电后 rradc 可能留着旧值，所以由调用方用
    charger.online 门控）。电流步长约 4.6 mA → 5V 下约 23 mW，够用。
    """
    base = "/sys/bus/iio/devices/iio:device1"
    def ch(name: str) -> float | None:
        raw = read_text(os.path.join(base, f"in_{name}_raw"))
        if raw is None:
            return None
        try:
            scale = float(read_text(os.path.join(base, f"in_{name}_scale")) or 1)
            return float(raw) * scale
        except ValueError:
            return None
    volts_uv = ch("voltage0")     # usbin_v
    amps_ua = ch("current0")      # usbin_i
    volts = (volts_uv or 0.0) / 1_000_000.0
    amps = (amps_ua or 0.0) / 1_000_000.0
    return {
        "voltage": round(volts, 3),
        "current_ma": round(amps * 1000, 1),
        "power": round(volts * amps, 3),
    }


def sample_swapio() -> tuple[int, int]:
    """/proc/vmstat 的 pswpin / pswpout（累计页数）—— 用来算交换速率。"""
    def get(key: str) -> int:
        for line in (read_text("/proc/vmstat", "") or "").splitlines():
            if line.startswith(key + " "):
                try:
                    return int(line.split()[1])
                except (ValueError, IndexError):
                    return 0
        return 0
    return get("pswpin"), get("pswpout")


# pmi8998-rradc 上的温度通道（thermal_zone 里没有 skin / chg，这两个是独有的）
IIO_TEMP_CH = (("1", "skin"), ("2", "pmic_die"), ("3", "chg"))

def sample_iio_temps() -> list[dict]:
    """IIO 的换算统一是 (raw + offset) × scale，这里 scale 的单位是 m°C。"""
    base = "/sys/bus/iio/devices/iio:device1"
    out = []
    for idx, fallback in IIO_TEMP_CH:
        raw_s = read_text(os.path.join(base, f"in_temp{idx}_raw"))
        if raw_s is None:
            continue
        try:
            raw = float(raw_s)
            offset = float(read_text(os.path.join(base, f"in_temp{idx}_offset")) or 0)
            scale = float(read_text(os.path.join(base, f"in_temp{idx}_scale")) or 1)
        except ValueError:
            continue
        label = (read_text(os.path.join(base, f"in_temp{idx}_label")) or fallback).strip()
        out.append({"type": label, "celsius": round((raw + offset) * scale / 1000.0, 1)})
    return out


def sample_loadavg() -> dict:
    raw = (read_text("/proc/loadavg", "") or "").split()
    running = raw[3].split("/") if len(raw) > 3 else ["0", "0"]
    return {
        "load1": float(raw[0]) if raw else 0.0,
        "load5": float(raw[1]) if len(raw) > 1 else 0.0,
        "load15": float(raw[2]) if len(raw) > 2 else 0.0,
        "running": int(running[0]) if running and running[0].isdigit() else 0,
        "threads": int(running[1]) if len(running) > 1 and running[1].isdigit() else 0,
    }


def sample_pressure() -> dict:
    out = {}
    for key, label in (("cpu", "cpu"), ("io", "io"), ("memory", "memory")):
        raw = read_text(f"/proc/pressure/{key}")
        if not raw:
            continue
        data = {}
        for part in raw.replace("\n", " ").split():
            if "=" in part:
                k, _, v = part.partition("=")
                try:
                    data[k] = float(v)
                except ValueError:
                    pass
        out[label] = data
    return out


def count_processes() -> int:
    try:
        return sum(1 for e in os.listdir("/proc") if e.isdigit())
    except OSError:
        return 0


def sample_processes(prev: dict[str, tuple[int, str]], dt: float):
    """返回 (当前采样, top5 CPU 占用进程)。CPU% 以单核为 100% 计。"""
    cur: dict[str, tuple[int, str]] = {}
    try:
        entries = os.listdir("/proc")
    except OSError:
        return prev, []

    for entry in entries:
        if not entry.isdigit():
            continue
        try:
            with open(f"/proc/{entry}/stat", "rb") as fh:
                data = fh.read()
        except OSError:
            continue
        close = data.rfind(b")")
        if close < 0:
            continue
        open_paren = data.find(b"(")
        comm = data[open_paren + 1 : close].decode("utf-8", "replace")
        rest = data[close + 2 :].split()
        if len(rest) < 13:
            continue
        try:
            ticks = int(rest[11]) + int(rest[12])  # utime + stime
        except ValueError:
            continue
        cur[entry] = (ticks, comm)

    top = []
    if prev and dt > 0:
        denom = dt * CLK_TCK
        deltas = []
        for pid, (ticks, comm) in cur.items():
            old = prev.get(pid)
            if old is None:
                continue
            delta = ticks - old[0]
            if delta > 0:
                deltas.append((delta / denom * 100.0, comm, pid))
        deltas.sort(reverse=True)
        top = [
            {"name": name, "pid": pid, "cpu": round(pct, 1)}
            for pct, name, pid in deltas[:5]
        ]
    return cur, top


def count_services() -> int:
    try:
        res = subprocess.run(
            ["systemctl", "list-units", "--type=service", "--state=running",
             "--no-legend", "--plain", "--no-pager"],
            capture_output=True, text=True, timeout=6,
        )
        return sum(1 for line in res.stdout.splitlines() if line.strip())
    except (OSError, subprocess.SubprocessError):
        return 0


def device_model() -> str:
    for path in (
        "/sys/firmware/devicetree/base/model",
        "/proc/device-tree/model",
    ):
        raw = read_text(path)
        if raw:
            return raw.replace("\x00", "").strip()
    return "LG V30 (joan)"


def os_pretty_name() -> str:
    try:
        with open("/etc/os-release", "r", encoding="utf-8") as fh:
            for line in fh:
                if line.startswith("PRETTY_NAME="):
                    return line.split("=", 1)[1].strip().strip('"')
    except OSError:
        pass
    return "Linux"


# --------------------------------------------------------------------------- #
# 采集器
# --------------------------------------------------------------------------- #

class Collector:
    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.series: dict[str, deque] = {k: deque(maxlen=HISTORY) for k in SERIES_KEYS}
        self.last_ts: float = 0.0
        self.snapshot: dict = {}
        self.services = 0
        self.model = device_model()
        self.os_name = os_pretty_name()
        self.kernel = os.uname().release
        self.hostname = socket.gethostname()
        self._prev_cpu = sample_cpu_stat()
        self._prev_net = sample_network()["ifaces"]
        self._prev_proc: dict[str, tuple[int, str]] = {}
        self._prev_proc_ts = 0.0
        self._prev_disk: dict = {}
        self._prev_snmp: dict = {}
        self._prev_swap: tuple[int, int] | None = None
        self._wifi: dict | None = None
        self._wifi_ts = 0.0
        self.disk_model = disk_model(DISK_DEV)
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    # -- 采集 -------------------------------------------------------------- #

    def start(self) -> None:
        self.sample()  # 立即来一次，前端一打开就有数
        self._thread = threading.Thread(target=self._loop, name="collector", daemon=True)
        self._thread.start()
        threading.Thread(target=self._service_loop, name="services", daemon=True).start()

    def _loop(self) -> None:
        while not self._stop.wait(INTERVAL):
            try:
                self.sample()
            except Exception as exc:  # noqa: BLE001 — 采集绝不能把线程搞死
                print(f"[collector] sample failed: {exc!r}", flush=True)

    def _service_loop(self) -> None:
        while not self._stop.is_set():
            try:
                self.services = count_services()
            except Exception:  # noqa: BLE001
                pass
            self._stop.wait(30)

    def sample(self) -> None:
        now = time.time()
        dt = now - self.last_ts if self.last_ts else 0.0   # 距上次采样的秒数

        cpu_stat = sample_cpu_stat()
        usage = {
            name: cpu_usage(self._prev_cpu[name], val)
            for name, val in cpu_stat.items()
            if name in self._prev_cpu
        }
        self._prev_cpu = cpu_stat

        freq = sample_cpufreq()
        thermal = sample_thermal()
        memory = sample_memory()
        disk = sample_disk()
        net = sample_network()
        battery = sample_battery()
        load = sample_loadavg()
        pressure = sample_pressure()

        # 网络速率
        rx_rate = tx_rate = 0.0
        prev_net = self._prev_net
        if self.last_ts and now > self.last_ts:
            dt_net = now - self.last_ts
            cur = net["ifaces"].get(net["primary"])
            old = prev_net.get(net["primary"])
            if cur and old:
                rx_rate = max(0.0, (cur[0] - old[0]) / dt_net)
                tx_rate = max(0.0, (cur[1] - old[1]) / dt_net)
        self._prev_net = net["ifaces"]

        # ---- 新增：存储 I/O / 网络质量 / 充电 / Zram / IIO 温度 ----
        diskstats = sample_diskstats()
        snmp = sample_snmp_tcp()
        iface_stats = sample_iface_stats(net["primary"])
        swapio = sample_swapio()
        charger = sample_charger()
        inp = sample_iio_input_power()
        # 拔电后 rradc 可能留着旧读数，所以用 charger.online 门控，再加个 50mW 下限
        input_on = bool(charger.get("online")) and inp["power"] > 0.05
        input_power = inp["power"] if input_on else 0.0
        zram = sample_zram()
        iio_temps = sample_iio_temps()
        if now - self._wifi_ts >= WIFI_EVERY:
            wifi = sample_wifi(net["primary"])
            if wifi:
                self._wifi = wifi
            self._wifi_ts = now

        io = {
            "device": DISK_DEV, "model": self.disk_model,
            "read_bps": 0.0, "write_bps": 0.0,
            "read_iops": 0.0, "write_iops": 0.0, "util_pct": 0.0,
            "read_total": 0, "write_total": 0,
        }
        cur_disk = diskstats.get(DISK_DEV)
        if cur_disk and self._prev_disk and dt > 0:
            io["read_bps"] = max(0, cur_disk["sectors_read"] - self._prev_disk["sectors_read"]) * 512 / dt
            io["write_bps"] = max(0, cur_disk["sectors_written"] - self._prev_disk["sectors_written"]) * 512 / dt
            io["read_iops"] = max(0, cur_disk["reads"] - self._prev_disk["reads"]) / dt
            io["write_iops"] = max(0, cur_disk["writes"] - self._prev_disk["writes"]) / dt
            # io_ms 是累计"花在 I/O 上的毫秒数"，除以墙钟时间就是繁忙百分比
            io["util_pct"] = min(100.0, max(0, cur_disk["io_ms"] - self._prev_disk["io_ms"]) / (dt * 10.0))
        if cur_disk:
            io["read_total"] = cur_disk["sectors_read"] * 512
            io["write_total"] = cur_disk["sectors_written"] * 512
        self._prev_disk = cur_disk or {}

        # 重传率 = 这段时间里重传的段数 / 发出的段数
        retx_pct = 0.0
        if snmp and self._prev_snmp and dt > 0:
            d_retx = max(0, snmp.get("RetransSegs", 0) - self._prev_snmp.get("RetransSegs", 0))
            d_out = max(0, snmp.get("OutSegs", 0) - self._prev_snmp.get("OutSegs", 0))
            if d_out > 0:
                retx_pct = d_retx / d_out * 100.0
        netq = dict(iface_stats)
        netq.update({
            "iface": net["primary"],
            "retx_pct": round(retx_pct, 2),
            "curr_estab": snmp.get("CurrEstab", 0),
            "retrans_total": snmp.get("RetransSegs", 0),
            "in_errs": snmp.get("InErrs", 0),
            "out_rsts": snmp.get("OutRsts", 0),
        })
        self._prev_snmp = snmp

        swap_rate = {"in_bps": 0.0, "out_bps": 0.0}
        if self._prev_swap and dt > 0:
            swap_rate["in_bps"] = max(0, swapio[0] - self._prev_swap[0]) * PAGE_SIZE / dt
            swap_rate["out_bps"] = max(0, swapio[1] - self._prev_swap[1]) * PAGE_SIZE / dt
        self._prev_swap = swapio

        # 进程
        if now - self._prev_proc_ts >= 2.0:
            dt_proc = now - self._prev_proc_ts if self._prev_proc_ts else 0.0
            self._prev_proc, top_procs = sample_processes(self._prev_proc, dt_proc)
            self._prev_proc_ts = now
            with self.lock:
                self.snapshot.setdefault("system", {})["top"] = top_procs
        proc_count = len(self._prev_proc) or count_processes()

        cores = []
        for i in range(NR_CORES):
            pol = freq["core_map"].get(i, {})
            cores.append(
                {
                    "index": i,
                    "usage": round(usage.get(f"cpu{i}", 0.0), 1),
                    "cur_mhz": pol.get("cur_mhz", 0),
                    "max_mhz": pol.get("max_mhz", 0),
                    "policy": pol.get("policy", "-"),
                }
            )

        soc = thermal["soc"] or {}
        soc_temp = soc.get("celsius")
        batt_temp_zone = (thermal["battery"] or {}).get("celsius")

        # 整机功耗。放电时就是电池输出；插着电时系统吃的是 VBUS，
        # 电池端 V×I 会小到接近 0（比如 inhibit-charge 时），直接用它会严重低估 ——
        # 所以：系统 = max(0, 输入功率 − 充入电池的功率) + 电池放出的功率。
        # 注意充电时这个差值里还含充电回路的损耗（buck + 充电 IC + 内阻），
        # 会比纯系统功耗略微偏高，这是这套传感器的精度上限。
        batt_in = max(0.0, battery["power"])
        batt_out = max(0.0, -battery["power"])
        system_power = round(max(0.0, input_power - batt_in) + batt_out, 3)

        # 电量剩余时间估算（按当前电流）
        batt = battery
        if batt["charging"] or batt["current"] == 0 or batt["design_capacity_mah"] is None:
            batt_remaining = None
        else:
            remaining_mah = batt["design_capacity_mah"] * batt["capacity"] / 100.0
            hours = remaining_mah / (abs(batt["current_ma"]) or 1)
            batt_remaining = int(hours * 3600)

        snap = {
            "ts": now,
            "interval": INTERVAL,
            "device": {
                "hostname": self.hostname,
                "model": self.model,
                "os": self.os_name,
                "kernel": self.kernel,
                "arch": os.uname().machine,
                "uptime": float((read_text("/proc/uptime", "0 0") or "0 0").split()[0]),
                "services": self.services,
                "ip": net["ip"],
                "iface": net["primary"],
                "cores": NR_CORES,
            },
            "cpu": {
                "total": round(usage.get("cpu", 0.0), 1),
                "cores": cores,
                "freq_cur_mhz": freq["cur_mhz"],
                "freq_max_mhz": freq["max_mhz"],
                "governor": freq["governor"],
                "policies": [
                    {k: v for k, v in p.items() if k != "cores"} | {"cores": p["cores"]}
                    for p in freq["policies"]
                ],
                "load": load,
                "processes": proc_count,
                "pressure": pressure.get("cpu", {}).get("avg60", 0.0),
            },
            "thermal": {
                "soc": soc_temp,
                "soc_zone": soc.get("type", "-"),
                "battery": batt_temp_zone,
                "zones": thermal["zones"],
                # IIO rradc 上才有：外壳(skin)、充电芯片(chg)。thermal_zone 里没有
                "iio_zones": iio_temps,
                "kernel_trips": thermal["trips"],
                "warning": TEMP_WARNING,
                "critical": TEMP_CRITICAL,
            },
            "memory": memory | {"zram": zram, "swap_rate": swap_rate},
            "disk": disk,
            "network": {
                "iface": net["primary"],
                "ip": net["ip"],
                "rx_rate": round(rx_rate, 1),
                "tx_rate": round(tx_rate, 1),
                "rx_total": net["ifaces"].get(net["primary"], (0, 0))[0],
                "tx_total": net["ifaces"].get(net["primary"], (0, 0))[1],
                "wifi": self._wifi,
            },
            "io": io,
            "netq": netq,
            "charger": charger,
            "battery": battery | {
                "remaining": batt_remaining,
                "system_power": system_power,          # 整机功耗（见上面注释）
                "source": "usb" if input_on else "battery",
                "input_power": round(input_power, 3),
                "input_voltage": inp["voltage"],
                "input_current_ma": inp["current_ma"],
                "batt_in_power": round(batt_in, 3),    # 真正充进电池的那部分
            },
            "system": {
                "load": load,
                "processes": proc_count,
                "services": self.services,
                "pressure": pressure,
                "top": self.snapshot.get("system", {}).get("top", []),
            },
        }

        values = {
            "cpu": snap["cpu"]["total"],
            "temp": soc_temp if soc_temp is not None else 0.0,
            "mem": memory["percent"],
            "disk": disk["root"]["percent"],
            "rx": round(rx_rate / 1024.0, 1),
            "tx": round(tx_rate / 1024.0, 1),
            "power": system_power,          # 曲线画的是**整机**功耗，不是电池端
            "batt_pow": battery["power"],   # 电池端功率（带符号：正=充入，负=放出）
            "batt": float(battery["capacity"]),
            "batt_cur": battery["current_ma_signed"],
            "load": load["load1"],
            "io_r": round(io["read_bps"] / 1024.0, 1),
            "io_w": round(io["write_bps"] / 1024.0, 1),
            "retx": netq["retx_pct"],
        }
        for core in cores[:8]:
            values[f"core{core['index']}"] = core["usage"]

        with self.lock:
            snap["system"]["top"] = self.snapshot.get("system", {}).get("top", [])
            self.snapshot = snap
            self.last_ts = now
            for key, val in values.items():
                if key in self.series:
                    self.series[key].append(round(float(val), 2))

    # -- 输出 -------------------------------------------------------------- #

    def payload(self) -> dict:
        with self.lock:
            snap = json.loads(json.dumps(self.snapshot))  # 简单深拷贝，避免并发读脏
            series = {
                key: list(buf) for key, buf in self.series.items() if len(buf) > 0
            }
            history = {key: buf.maxlen for key, buf in self.series.items()}
        return {
            "ok": True,
            "now": time.time(),
            "series": series,
            "history_len": history,
            **snap,
        }


COLLECTOR = Collector()


# --------------------------------------------------------------------------- #
# HTTP
# --------------------------------------------------------------------------- #

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".webmanifest": "application/manifest+json",
    ".ico": "image/x-icon",
}


class Handler(BaseHTTPRequestHandler):
    server_version = "v30-monitor"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # 静音访问日志
        pass

    def _send(self, code: int, body: bytes, ctype: str, extra: dict | None = None) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path

        if path in ("/api/state", "/api/telemetry"):
            body = json.dumps(COLLECTOR.payload(), separators=(",", ":")).encode()
            self._send(200, body, "application/json; charset=utf-8")
            return

        if path == "/api/health":
            self._send(200, b'{"ok":true}', "application/json")
            return

        if path in ("/", "/index.html"):
            path = "/index.html"

        rel = os.path.normpath(path.lstrip("/"))
        if rel.startswith(".."):
            self._send(403, b"forbidden", "text/plain")
            return

        full = os.path.join(STATIC_DIR, rel)
        if not os.path.isfile(full):
            self._send(404, b"not found", "text/plain; charset=utf-8")
            return

        ext = os.path.splitext(full)[1].lower()
        try:
            with open(full, "rb") as fh:
                body = fh.read()
        except OSError:
            self._send(500, b"read error", "text/plain")
            return
        self._send(200, body, CONTENT_TYPES.get(ext, "application/octet-stream"))

    do_HEAD = do_GET


def main() -> None:
    COLLECTOR.start()
    httpd = ThreadingHTTPServer((HOST, PORT), Handler)
    httpd.daemon_threads = True
    print(f"v30 Monitor listening on http://{HOST}:{PORT}  (interval={INTERVAL}s)", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
