// 还没做登录页，先用固定的演示账号自动登录。张三只绑定了店铺 1，换成 admin@test.com 能看全部店铺
const DEMO_ACCOUNT = { email: "zhangsan@test.com", password: "123456" };
const TOKEN_KEY = "assistant_token";

async function login(): Promise<string> {
  const res = await fetch("/py/user/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(DEMO_ACCOUNT),
  });
  if (!res.ok) throw new Error(`登录失败：HTTP ${res.status}`);
  const { access_token } = await res.json();
  localStorage.setItem(TOKEN_KEY, access_token);
  return access_token;
}

// 有缓存的 token 就直接用；refresh 为 true 时（上次请求返回 401，token 过期了）重新登录
async function getToken(refresh = false): Promise<string> {
  const cached = localStorage.getItem(TOKEN_KEY);
  if (cached && !refresh) return cached;
  return login();
}

// 带上 token 请求；token 过期返回 401 时重新登录，再请求一次
export async function authFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const request = (token: string) =>
    fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  const res = await request(await getToken());
  if (res.status !== 401) return res;
  return request(await getToken(true));
}
