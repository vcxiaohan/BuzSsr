import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // 前端请求 /py/xxx 由 Next 转发到 pyfast（FastAPI），浏览器看到的是同源，不用处理跨域
      { source: "/py/:path*", destination: "http://127.0.0.1:8000/:path*" },
    ];
  },
};

export default nextConfig;
