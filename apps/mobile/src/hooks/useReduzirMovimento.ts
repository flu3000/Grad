import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** "Reduzir movimento" ligado no sistema: o mapa não anima sozinho (o avanço de período/hora é manual). */
export function useReduzirMovimento(): boolean {
  const [reduzir, setReduzir] = useState(false);
  useEffect(() => {
    let ativo = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (ativo) setReduzir(v);
      })
      .catch(() => undefined);
    const assinatura = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduzir);
    return () => {
      ativo = false;
      assinatura.remove();
    };
  }, []);
  return reduzir;
}
