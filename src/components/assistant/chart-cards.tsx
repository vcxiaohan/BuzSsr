"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { Card } from "./cards";

// 按需引入，只打包用到的图表和组件，比引入整个 echarts 小很多
echarts.use([LineChart, BarChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

type ChartData = {
  chart: "line" | "bar";
  horizontal?: boolean;
  title: string;
  date_range: string;
  unit: string;
  x: string[];
  series: { name: string; data: number[] }[];
};

type Overview = {
  title: string;
  date_range: string;
  compare_label: string;
  metrics: { label: string; value: number; unit: string; change: string }[];
};

function formatValue(value: number, unit: string) {
  if (unit === "%") return `${value}%`;
  if (unit === "元" && value >= 10000) return `${(value / 10000).toFixed(1)} 万元`;
  return `${value.toLocaleString()} ${unit}`;
}

// 后端只给数据，图怎么画在这里统一决定，所有图表风格一致
function buildOption(data: ChartData): echarts.EChartsCoreOption {
  const multiple = data.series.length > 1;
  // 横向柱状图从下往上画，倒过来才是第一名在最上面
  const order = <T,>(list: T[]) => (data.horizontal ? [...list].reverse() : list);
  const categoryAxis = { type: "category", data: order(data.x), axisTick: { show: false } };
  const valueAxis = { type: "value", splitLine: { lineStyle: { type: "dashed" } } };
  return {
    grid: { left: 4, right: 12, top: multiple ? 32 : 12, bottom: 4, containLabel: true },
    tooltip: { trigger: "axis", valueFormatter: (value: unknown) => formatValue(Number(value), data.unit) },
    legend: multiple ? { type: "scroll", top: 0, itemWidth: 12, itemHeight: 8 } : undefined,
    xAxis: data.horizontal ? valueAxis : categoryAxis,
    yAxis: data.horizontal ? categoryAxis : valueAxis,
    series: data.series.map((item) => ({
      name: item.name,
      type: data.chart,
      data: order(item.data),
      smooth: true,
      // 点太多时不画圆点，鼠标移上去才显示
      showSymbol: data.x.length <= 31,
      barMaxWidth: 24,
    })),
  };
}

function ChartCard({ card }: { card: Card }) {
  const data = card as unknown as ChartData;
  const ref = useRef<HTMLDivElement>(null);
  const empty = data.series.every((item) => item.data.every((value) => value === 0));

  useEffect(() => {
    if (!ref.current || empty) return;
    // ECharts 要操作 DOM，只能在浏览器里初始化；卡片卸载时必须销毁实例，否则会内存泄漏
    const chart = echarts.init(ref.current);
    chart.setOption(buildOption(data));
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [data, empty]);

  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3 text-sm">
      <div className="font-medium">{data.title}</div>
      <div className="mt-1 text-xs text-zinc-500">{data.date_range}</div>
      {empty ? (
        <div className="mt-3 rounded-md bg-zinc-50 py-6 text-center text-xs text-zinc-400">这段时间没有数据</div>
      ) : (
        <div ref={ref} className="mt-2 h-56 w-full" />
      )}
    </div>
  );
}

function KpiCard({ card }: { card: Card }) {
  const data = card as unknown as Overview;
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-3 text-sm">
      <div className="font-medium">{data.title}</div>
      <div className="mt-1 text-xs text-zinc-500">{data.date_range}</div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {data.metrics.map((metric) => (
          <div key={metric.label} className="rounded-md bg-zinc-50 p-2">
            <div className="text-xs text-zinc-500">{metric.label}</div>
            <div className="mt-1 text-base font-medium">{formatValue(metric.value, metric.unit)}</div>
            {/* 国内习惯涨红跌绿 */}
            <div
              className={`mt-0.5 text-xs ${
                metric.change.startsWith("+") ? "text-red-500" : metric.change.startsWith("-") ? "text-green-600" : "text-zinc-400"
              }`}
            >
              {data.compare_label} {metric.change}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const chartCardMap = { chart: ChartCard, kpi: KpiCard };
