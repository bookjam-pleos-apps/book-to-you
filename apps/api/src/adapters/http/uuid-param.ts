const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 형식이 틀린 id를 그대로 넘기면 Postgres가 uuid 변환 오류를 내 500이 된다.
export const isUuid = (value: string): boolean => UUID.test(value);
