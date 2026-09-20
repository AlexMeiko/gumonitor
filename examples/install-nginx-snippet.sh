#!/bin/sh
# 把 examples/nginx-subpath.conf 里的 location 片段，幂等地插进 nginx 的默认 server 块。
#
# 幂等：已经存在同样的 location 就跳过；改完先 nginx -t，失败自动回滚。
# 用法（一般要 root）：sudo sh install-nginx-snippet.sh /path/to/nginx-subpath.conf
set -e

SNIPPET="${1:-./nginx-subpath.conf}"
MARK='location /monitor/'

# nginx 默认 server 块的位置各发行版不同，按常见顺序找
CONF=""
for c in /etc/nginx/http.d/default.conf \
         /etc/nginx/conf.d/default.conf \
         /etc/nginx/sites-enabled/default \
         /etc/nginx/nginx.conf; do
    if [ -f "$c" ]; then CONF="$c"; break; fi
done

[ -f "$SNIPPET" ] || { echo "找不到片段文件: $SNIPPET" >&2; exit 1; }
[ -n "$CONF" ] || { echo "找不到 nginx 配置文件，请手动插入片段" >&2; exit 1; }
echo "使用配置：$CONF"

if grep -q "$MARK" "$CONF"; then
    echo "已经配置过 $MARK，跳过"
    nginx -t
    exit 0
fi

BAK="$CONF.bak.$(date +%Y%m%d%H%M%S)"
cp -p "$CONF" "$BAK"
echo "已备份 -> $BAK"

TMP="$(mktemp)"
awk -v snipfile="$SNIPPET" '
    { line[NR] = $0 }
    END {
        last = 0
        for (i = NR; i >= 1; i--) {
            if (line[i] ~ /^[[:space:]]*}[[:space:]]*$/) { last = i; break }
        }
        for (i = 1; i <= NR; i++) {
            if (i == last) {
                print ""
                while ((getline s < snipfile) > 0) print s
            }
            print line[i]
        }
    }
' "$CONF" > "$TMP"
mv "$TMP" "$CONF"

if nginx -t; then
    if command -v systemctl >/dev/null 2>&1; then
        systemctl reload nginx 2>/dev/null || systemctl restart nginx
    elif command -v rc-service >/dev/null 2>&1; then
        rc-service nginx reload 2>/dev/null || rc-service nginx restart
    else
        nginx -s reload
    fi
    echo "nginx 已重载"
else
    echo "nginx -t 失败，回滚" >&2
    cp -p "$BAK" "$CONF"
    exit 1
fi
