import { useState } from "react";

import { Check } from "../../shared/ui/controls";
import { AGREEMENTS, agreeToAll, isAllAgreed, toggleAgreement, type Agreed, type AgreementId } from "./agreements";

export const useAgreements = () => {
  const [checked, setChecked] = useState<Agreed>(() => agreeToAll(false));
  const toggle = (id: AgreementId, on: boolean) => setChecked((current) => toggleAgreement(current, id, on));
  const toggleAll = (on: boolean) => setChecked(agreeToAll(on));
  return { checked, toggle, toggleAll, allAgreed: isAllAgreed(checked) };
};

type AgreementChecksProps = ReturnType<typeof useAgreements>;

// 맨 위 "모두 동의" 한 번이면 끝난다. 항목은 무엇에 동의하는지 보이도록 그대로 둔다.
export const AgreementChecks = ({ checked, toggle, toggleAll, allAgreed }: AgreementChecksProps) => (
  <>
    <Check checked={allAgreed} onChange={toggleAll}>
      <strong>모두 동의해요</strong>
    </Check>
    {AGREEMENTS.map((agreement) => (
      <Check key={agreement.id} checked={checked.has(agreement.id)} onChange={(on) => toggle(agreement.id, on)}>
        {agreement.text}
      </Check>
    ))}
  </>
);
