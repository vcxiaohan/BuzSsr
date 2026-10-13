const orders: { id: string; source: string }[] = [];

export async function GET() {
  return Response.json({ code: 0, data: orders });
}

export async function POST(request: Request) {
  const { source } = await request.json();

  // 模拟慢接口，方便在请求未返回前连点
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const order = { id: `NO${Date.now()}`, source };
  orders.push(order);
  return Response.json({ code: 0, data: order });
}
