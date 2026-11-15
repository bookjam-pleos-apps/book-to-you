import { useNavigate } from "react-router";

import { TextLink } from "../../shared/ui/controls";
import { PendingLoads } from "../../shared/ui/pending-loads";
import { Card } from "../../shared/ui/surfaces";
import { SectionTitle } from "../../shared/ui/text";
import { PAIR_PATH, useDevices } from "./devices-api";

const lastSeenText = (lastSeenAt: string | null): string =>
  lastSeenAt === null ? "아직 이야기를 받지 않았어요" : `마지막 연결 ${new Date(lastSeenAt).toLocaleDateString("ko-KR")}`;

// 내 정보 화면의 차 구역이다. 연결은 홈 알림이나 차 QR로 주로 하고, 여기서는 두 번째 차를 연결할 때 쓴다.
export const DeviceList = () => {
  const navigate = useNavigate();
  const devices = useDevices();
  if (!devices.data) return <PendingLoads queries={[devices]} />;
  return (
    <>
      <SectionTitle>연결된 차</SectionTitle>
      {devices.data.devices.map((device) => (
        <Card key={device.id} className="gap-1">
          <h3 className="text-label font-bold">{device.name}</h3>
          <span className="text-caption text-ink-3">{lastSeenText(device.lastSeenAt)}</span>
        </Card>
      ))}
      <TextLink onClick={() => navigate(PAIR_PATH)}>차 연결하기</TextLink>
    </>
  );
};
