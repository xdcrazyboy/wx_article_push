"""
微信文章推送服务 - 支持局域网 + 公网(ntfy.sh)双模式
"""
from http.server import HTTPServer, BaseHTTPRequestHandler
import json, socket, os, urllib.request, urllib.error

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
pending_urls = []  # 局域网模式用

# ==============================
# 修改这里：设置你的专属频道名
# 随便起，越独特越好，相当于密码
NTFY_TOPIC = "wechat-push-bobo-x7k2"
# ==============================

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    finally:
        s.close()

def read_file(name):
    with open(os.path.join(BASE_DIR, name), encoding="utf-8") as f:
        return f.read()

def ntfy_push(url):
    """转发到 ntfy.sh，让电脑插件跨网接收"""
    try:
        req = urllib.request.Request(
            f"https://ntfy.sh/{NTFY_TOPIC}",
            data=url.encode(),
            headers={"Title": "微信文章", "Tags": "link"},
            method="POST"
        )
        urllib.request.urlopen(req, timeout=5)
        print(f"[ntfy] 已推送: {url}")
    except Exception as e:
        print(f"[ntfy] 推送失败: {e}")

class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def send_cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_cors()
        self.end_headers()

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            body = read_file("phone_page.html").encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", len(body))
            self.end_headers()
            self.wfile.write(body)

        elif self.path == "/phone.js":
            body = read_file("phone.js").encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript; charset=utf-8")
            self.send_header("Content-Length", len(body))
            self.end_headers()
            self.wfile.write(body)

        elif self.path == "/poll":
            # 局域网模式：插件轮询
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_cors()
            self.end_headers()
            if pending_urls:
                url = pending_urls.pop(0)
                self.wfile.write(json.dumps({"url": url}).encode())
                print(f"[局域网] 发送: {url}")
            else:
                self.wfile.write(b'{"url":null}')

        elif self.path == "/topic":
            # 插件启动时获取 ntfy topic
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_cors()
            self.end_headers()
            self.wfile.write(json.dumps({"topic": NTFY_TOPIC}).encode())

        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == "/push":
            length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(length)
            try:
                data = json.loads(body)
                url = data.get("url", "").strip()
                if url:
                    pending_urls.append(url)   # 局域网
                    ntfy_push(url)             # 公网
                    print(f"[收到] {url}")
                    resp = b'{"ok":true}'
                else:
                    resp = b'{"ok":false}'
            except Exception:
                resp = b'{"ok":false}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_cors()
            self.end_headers()
            self.wfile.write(resp)
        else:
            self.send_response(404)
            self.end_headers()

if __name__ == "__main__":
    PORT = 8765
    ip = get_local_ip()
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    print("=" * 52)
    print("  微信文章推送服务已启动（双模式）")
    print("=" * 52)
    print(f"  局域网模式 - 手机访问：http://{ip}:{PORT}")
    print(f"  公网模式   - ntfy频道：{NTFY_TOPIC}")
    print("=" * 52)
    print("  两种模式同时生效，电脑插件自动接收")
    print("  保持此窗口开启，最小化即可")
    print("=" * 52)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已停止")
