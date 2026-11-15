import { useQueryClient } from "@tanstack/react-query";
import type { VoiceResponse } from "@voice-storybook/shared/contracts/v1";
import { useState } from "react";
import { Navigate } from "react-router";

import { failureCode } from "../../../shared/api-client/api-error";
import { QUERY_KEYS } from "../../../shared/api-client/query-keys";
import { useTerms, type Terms } from "../../../shared/api-client/terms";
import { ProblemAlert } from "../../../shared/ui/alert";
import { Button } from "../../../shared/ui/button";
import { Check } from "../../../shared/ui/controls";
import { PendingLoads } from "../../../shared/ui/pending-loads";
import { Dock } from "../../../shared/ui/screen";
import { Notice, ScriptCard } from "../../../shared/ui/surfaces";
import { Hint, Lead, Title } from "../../../shared/ui/text";
import { MicGuideOverlay } from "../mic-guide/mic-guide-overlay";
import { useMicGuide } from "../mic-guide/use-mic-guide";
import { RecordPanel } from "./record-panel";
import { PHRASE_MISMATCH_FEEDBACK } from "./recording-feedback";
import { consentOutcome } from "./upload-outcome";
import { useCheckedUpload } from "./use-checked-upload";
import { refreshVoice, submitConsent, useConsentPhrase } from "../voices-api";

type StepProps = { readonly voice: VoiceResponse; readonly onNext: () => void };

type Phrase = { readonly phrase: string; readonly phraseToken: string };

const ConsentChecking = ({ voice, onNext }: StepProps) => {
  const queryClient = useQueryClient();
  const [stillChecking, setStillChecking] = useState(false);
  const recheck = async () => {
    const fresh = await refreshVoice(queryClient, voice.id);
    if (consentOutcome(fresh) === "passed") return onNext();
    setStillChecking(true);
  };
  return (
    <>
      <Notice>읽은 문장을 확인하고 있어요. 확인이 끝나야 다음 녹음을 올릴 수 있어요.</Notice>
      {stillChecking ? <Hint>아직 확인 중이에요. 잠시 뒤에 다시 눌러 주세요.</Hint> : null}
      <Dock>
        <Button className="w-full" onClick={() => void recheck()}>
          다시 확인
        </Button>
      </Dock>
    </>
  );
};

type RecorderProps = StepProps & { readonly phrase: Phrase; readonly terms: Terms };

const useConsentUpload = ({ voice, onNext, phrase, terms }: RecorderProps) =>
  useCheckedUpload({
    voiceId: voice.id,
    send: async (audio) => (await submitConsent(voice.id, { phraseToken: phrase.phraseToken, speakerLabel: voice.label, terms }, audio)).id,
    judge: (fresh) => consentOutcome(fresh),
    failedFeedback: () => PHRASE_MISMATCH_FEEDBACK,
    onPassed: onNext,
    alreadyDone: (error) => failureCode(error) === "already_live",
  });

const ConsentRecorder = (props: RecorderProps) => {
  const { voice, onNext, phrase } = props;
  const queryClient = useQueryClient();
  const [ownVoice, setOwnVoice] = useState(false);
  const upload = useConsentUpload(props);
  // 문구 토큰은 10분 뒤 만료된다(invalid_phrase). 탈락 뒤 다시 녹음할 때는 늘 새 문장으로 읽게 해 만료로 막히지 않게 한다.
  const renewPhraseAfterFailure = () => {
    if (upload.retake) void queryClient.invalidateQueries({ queryKey: QUERY_KEYS.consentPhrase(voice.id) });
  };
  if (upload.checking) return <ConsentChecking voice={voice} onNext={onNext} />;
  // 체크 전에도 패널을 그려 둔다. 체크하는 순간 체크 상자가 다시 그려져 포커스를 잃지 않게 한다.
  return (
    <RecordPanel kind="consent" upload={upload} onStartAgain={renewPhraseAfterFailure} locked={!ownVoice}>
      {/* 이 화면에 다시 들어온 경우의 안내다. 방금 올린 결과는 녹음 패널이 보여 주므로 겹쳐 띄우지 않는다. */}
      {voice.consentRejected && upload.feedback === null ? <ProblemAlert {...PHRASE_MISMATCH_FEEDBACK} /> : null}
      <ScriptCard>{phrase.phrase}</ScriptCard>
      <Check checked={ownVoice} onChange={setOwnVoice}>제 목소리로 제가 직접 읽어요.</Check>
    </RecordPanel>
  );
};

// 확인 중이면 문장을 다시 받지 않는다. 읽을 때만 문장과 약관을 받는다.
const ConsentReading = ({ voice, onNext }: StepProps) => {
  const phrase = useConsentPhrase(voice.id);
  const terms = useTerms();
  const guide = useMicGuide(voice);
  return (
    <>
      {guide.open ? <MicGuideOverlay onClose={guide.close} /> : null}
      <Lead>화면의 문장을 소리 내어 읽어 주세요.</Lead>
      {phrase.data && terms.data ? (
        <ConsentRecorder voice={voice} onNext={onNext} phrase={phrase.data} terms={terms.data} />
      ) : (
        <PendingLoads queries={[phrase, terms]} />
      )}
    </>
  );
};

const ConsentBody = ({ voice, onNext }: StepProps) => (
  <>
    <Title>낭독 확인</Title>
    {voice.consent === "checking" ? <ConsentChecking voice={voice} onNext={onNext} /> : <ConsentReading voice={voice} onNext={onNext} />}
  </>
);

// 이미 확인된 목소리로 들어오면 다시 읽을 것이 없으니 다음 단계로 넘긴다(문장도 받지 않는다).
// 방금 통과해 확인된 경우는 onNext가 넘기므로, 들어온 순간의 상태만 본다.
export const ConsentStep = ({ skipTo, ...props }: StepProps & { readonly skipTo: string }) => {
  const [arrivedConfirmed] = useState(() => props.voice.consent === "active");
  if (arrivedConfirmed) return <Navigate to={skipTo} replace />;
  return <ConsentBody {...props} />;
};
