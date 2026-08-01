export function sanitizeMessage(msg: any) {
  const { senderIp, ...rest } = msg;
  return rest;
}
