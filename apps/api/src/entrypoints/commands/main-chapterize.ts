import { composeChapterize } from "../../composition-demo";

const chapterize = await composeChapterize(process.env);
const outcomes = await chapterize.run().finally(chapterize.stop);
outcomes.forEach((outcome) => console.info(JSON.stringify(outcome)));
const failed = outcomes.filter((outcome) => outcome.result === "chapter_silences_mismatch" || outcome.result === "chapter_plan_invalid");
process.exitCode = failed.length === 0 ? 0 : 1;
