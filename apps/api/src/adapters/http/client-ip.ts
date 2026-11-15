const IPV4_MAPPED = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i;
const IPV6_NETWORK_GROUPS = 4;
const IPV6_GROUPS = 8;

const expandIpv6 = (address: string): readonly string[] => {
  const [head = "", tail] = address.split("::");
  const headGroups = head === "" ? [] : head.split(":");
  const tailGroups = tail === undefined || tail === "" ? [] : tail.split(":");
  const zeros = Array.from({ length: IPV6_GROUPS - headGroups.length - tailGroups.length }, () => "0");
  return [...headGroups, ...zeros, ...tailGroups];
};

// IPv6 사용자는 보통 /64를 통째로 받아, 주소별로 세면 제한을 바로 우회할 수 있다.
export const ipRateLimitKey = (address: string): string => {
  const mapped = IPV4_MAPPED.exec(address)?.[1];
  if (mapped !== undefined) return mapped;
  if (!address.includes(":")) return address;
  return expandIpv6(address).slice(0, IPV6_NETWORK_GROUPS).join(":").toLowerCase();
};

// XFF의 왼쪽 값은 클라이언트가 위조할 수 있다. 신뢰하는 프록시가 붙인 맨 오른쪽 값만 쓴다.
export const clientAddress = (forwardedFor: string | undefined, remoteAddress: string, trustProxy: boolean): string => {
  if (!trustProxy) return remoteAddress;
  return forwardedFor?.split(",").at(-1)?.trim() || remoteAddress;
};
