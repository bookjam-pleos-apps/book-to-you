import { Button } from "../../shared/ui/button";
import { Dock } from "../../shared/ui/screen";
import { Title } from "../../shared/ui/text";
import { AgreementChecks, useAgreements } from "./agreement-checks";

export const TermsStep = ({ onAgree }: { readonly onAgree: () => void }) => {
  const agreements = useAgreements();
  return (
    <>
      <Title>시작하기 전에</Title>
      <AgreementChecks {...agreements} />
      <Dock>
        <Button className="w-full" disabled={!agreements.allAgreed} onClick={onAgree}>
          동의하고 계속
        </Button>
      </Dock>
    </>
  );
};
