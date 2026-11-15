import type { ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";

import { LoginScreen } from "../features/auth/login-screen";
import { StartScreen } from "../features/auth/start-screen";
import { SHELF_PATH, STORIES_PATH } from "../features/library/library-paths";
import { StoryListenScreen } from "../features/library/story-listen-screen";
import { StoryListScreen } from "../features/library/story-list-screen";
import { NameScreen } from "../features/voices/record/name-screen";
import { RecordFlowScreen } from "../features/voices/record/record-flow-screen";
import { VoiceDetailScreen } from "../features/voices/manage/voice-detail-screen";
import { VoiceNameScreen } from "../features/voices/manage/voice-name-screen";
import { NEW_VOICE_PATH } from "../features/voices/voice-paths";
import { HOME_PATH } from "../shared/routing/return-path";
import { AccountScreen } from "./account-screen";
import { ACCOUNT_PATH, HomeScreen } from "./home-screen";
import { PairEntry } from "./pair-entry";
import { RequireSession } from "./require-session";
import { InAppNotice, shouldShowInAppNotice } from "./in-app-notice";
import { PairDoneScreen } from "./pair-done-screen";
import { StoryMakeScreen } from "./story-make-screen";
import { VoiceDoneScreen } from "./voice-done-screen";

const guarded = (screen: ReactNode) => <RequireSession>{screen}</RequireSession>;

// SPA 경로에는 /v1을 쓰지 않는다. /v1/*는 API로 간다.
export const AppRoutes = () => {
  const { pathname } = useLocation();
  if (shouldShowInAppNotice(pathname)) return <InAppNotice />;
  return (
    <Routes>
      <Route path="/" element={<StartScreen />} />
      <Route path="/login/:step?" element={<LoginScreen />} />
      <Route path={HOME_PATH} element={guarded(<HomeScreen />)} />
      <Route path={NEW_VOICE_PATH} element={guarded(<NameScreen />)} />
      <Route path="/voices/:voiceId" element={guarded(<VoiceDetailScreen />)} />
      <Route path="/voices/:voiceId/name" element={guarded(<VoiceNameScreen />)} />
      <Route path="/voices/:voiceId/record/:step" element={guarded(<RecordFlowScreen />)} />
      <Route path="/voices/:voiceId/done" element={guarded(<VoiceDoneScreen />)} />
      <Route path={STORIES_PATH} element={guarded(<StoryListScreen />)} />
      <Route path={`${STORIES_PATH}/:storyId`} element={guarded(<StoryMakeScreen />)} />
      <Route path={SHELF_PATH} element={<Navigate to={HOME_PATH} replace />} />
      <Route path={`${SHELF_PATH}/:renderId`} element={guarded(<StoryListenScreen />)} />
      <Route path={ACCOUNT_PATH} element={guarded(<AccountScreen />)} />
      <Route path="/pair" element={<PairEntry />} />
      <Route path="/pair/done" element={guarded(<PairDoneScreen />)} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};
