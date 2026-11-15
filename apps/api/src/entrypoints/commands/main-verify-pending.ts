import { composeVerifyPending } from "../../composition-workers";

const { passed, failed, waiting, unavailable, errors } = await composeVerifyPending(process.env);
errors.forEach((error) => console.error(error));
console.info(`확인 통과 ${passed}건, 탈락 ${failed}건, calm 통과를 기다림 ${waiting}건, 확인하지 못해 남음 ${unavailable}건`);
process.exitCode = unavailable === 0 ? 0 : 1;
