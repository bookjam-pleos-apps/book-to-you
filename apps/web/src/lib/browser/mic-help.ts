// 마이크 권한을 거부했을 때 다시 켜는 길은 기기마다 다르다. 한 줄로 그 기기의 길만 알려 준다.
const IOS = /iPhone|iPad|iPod/i;
const ANDROID = /Android/i;

export const micHelpFor = (userAgent: string): string => {
  if (IOS.test(userAgent)) return "주소창의 '가가' 버튼 → 웹 사이트 설정에서 마이크를 허용한 뒤 다시 눌러 주세요.";
  if (ANDROID.test(userAgent)) return "주소창 왼쪽 자물쇠 → 권한에서 마이크를 허용한 뒤 다시 눌러 주세요.";
  return "주소창의 설정에서 마이크를 허용한 뒤 다시 눌러 주세요.";
};
