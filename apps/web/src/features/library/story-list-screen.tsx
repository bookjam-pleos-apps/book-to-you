import type { Story } from "@voice-storybook/shared/contracts/v1";
import { useNavigate } from "react-router";

import { HOME_PATH } from "../../shared/routing/return-path";
import { PendingLoads } from "../../shared/ui/pending-loads";
import { Screen, TopBar } from "../../shared/ui/screen";
import { Body, Title } from "../../shared/ui/text";
import { BookCard, BookGrid } from "./book-card";
import { useStories } from "./library-api";
import { storyMakePath } from "./library-paths";

const StoryCard = ({ story }: { readonly story: Story }) => <BookCard storyId={story.id} title={story.title} to={storyMakePath(story.id)} />;

const StoryCards = () => {
  const stories = useStories();
  if (!stories.data) return <PendingLoads queries={[stories]} />;
  if (stories.data.stories.length === 0) return <Body>아직 고를 수 있는 동화가 없어요.</Body>;
  return <BookGrid>{stories.data.stories.map((story) => <StoryCard key={story.id} story={story} />)}</BookGrid>;
};

export const StoryListScreen = () => {
  const navigate = useNavigate();
  return (
    <Screen>
      <TopBar title="동화 고르기" onBack={() => navigate(HOME_PATH)} />
      <Title>어떤 동화를 만들까요?</Title>
      <StoryCards />
    </Screen>
  );
};
