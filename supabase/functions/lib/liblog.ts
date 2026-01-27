// lib/log.ts
export function log(
  level: 'info' | 'warn' | 'error',
  msg: string,
  ctx: Record<string, unknown> = {}
) {
  console.log(
    JSON.stringify({
      t: new Date().toISOString(),
      level,
      msg,
      ...ctx,
    })
  );
}
