import React from 'react';
import { Clock, Pause, Play, SkipBack, SkipForward } from 'lucide-react-native';
import { useTheme } from 'styled-components/native';
import { useFiltro } from '../../../contexts/Filtro_Context';
import { useReduzirMovimento } from '../../../hooks/useReduzirMovimento';
import { avancar, rotuloAcessivelPeriodo } from '../../../lib/filtro';
import { INDICES_PERIODO, PERIODOS, intervaloDoPeriodo, type IndicePeriodo } from '../../../lib/tempo';
import * as S from './styles';

/**
 * Chips do filtro do mapa: ▶/⏸, dia inteiro, os 4 períodos e "Por hora". Com "reduzir movimento" ligado no sistema,
 * o ▶ vira dois botões de avanço manual.
 */
const Filtro_Periodo = () => {
  const theme = useTheme();
  const reduzir = useReduzirMovimento();
  const { modo, setModo, periodo, setPeriodo, hora, setHora, tocando, setTocando } = useFiltro();

  const escolherPeriodo = (p: IndicePeriodo) => {
    setModo('periodo');
    setPeriodo(p);
  };

  // Play no dia inteiro começa pelo período de agora (setModo já escolhe o período atual).
  const alternarPlay = () => {
    if (tocando) return setTocando(false);
    if (modo === 'dia_inteiro') setModo('periodo');
    setTocando(true);
  };

  const passo = (p: 1 | -1) => {
    if (modo === 'dia_inteiro') return setModo('periodo');
    const novo = avancar({ modo, periodo, hora }, p);
    if (modo === 'periodo') setPeriodo(novo.periodo);
    else setHora(novo.hora);
  };

  const icone = theme.colors.textPrimary;
  const rotuloPlay = tocando
    ? 'Pausar a animação'
    : modo === 'hora'
      ? 'Animar o mapa hora a hora'
      : 'Animar o mapa pelos períodos do dia';

  return (
    <S.Rolagem horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingRight: 12 }}>
      {reduzir ? (
        <>
          <S.Botao onPress={() => passo(-1)} accessibilityRole="button" accessibilityLabel={modo === 'hora' ? 'Hora anterior' : 'Período anterior'}>
            <SkipBack color={icone} size={16} />
          </S.Botao>
          <S.Botao onPress={() => passo(1)} accessibilityRole="button" accessibilityLabel={modo === 'hora' ? 'Próxima hora' : 'Próximo período'}>
            <SkipForward color={icone} size={16} />
          </S.Botao>
        </>
      ) : (
        <S.Botao $ativo={tocando} onPress={alternarPlay} accessibilityRole="button" accessibilityLabel={rotuloPlay} accessibilityState={{ selected: tocando }}>
          {tocando ? <Pause color={theme.colors.onAccent} size={16} /> : <Play color={icone} size={16} />}
        </S.Botao>
      )}

      <S.Chip
        $ativo={modo === 'dia_inteiro'}
        onPress={() => setModo('dia_inteiro')}
        accessibilityRole="radio"
        accessibilityState={{ selected: modo === 'dia_inteiro' }}
        accessibilityLabel="Período: dia inteiro"
      >
        <S.ChipTexto $ativo={modo === 'dia_inteiro'}>Dia inteiro</S.ChipTexto>
      </S.Chip>

      {INDICES_PERIODO.map((p) => {
        const ativo = modo === 'periodo' && periodo === p;
        return (
          <S.Chip
            key={p}
            $ativo={ativo}
            onPress={() => escolherPeriodo(p)}
            accessibilityRole="radio"
            accessibilityState={{ selected: ativo }}
            accessibilityLabel={rotuloAcessivelPeriodo(p)}
          >
            <S.ChipTexto $ativo={ativo}>{PERIODOS[p].nome}</S.ChipTexto>
            <S.ChipDetalhe $ativo={ativo}>{intervaloDoPeriodo(p)}</S.ChipDetalhe>
          </S.Chip>
        );
      })}

      <S.Chip
        $ativo={modo === 'hora'}
        onPress={() => setModo('hora')}
        accessibilityRole="radio"
        accessibilityState={{ selected: modo === 'hora' }}
        accessibilityLabel="Mapa por hora"
      >
        <Clock color={modo === 'hora' ? theme.colors.onAccent : icone} size={14} />
        <S.ChipTexto $ativo={modo === 'hora'}>Por hora</S.ChipTexto>
      </S.Chip>
    </S.Rolagem>
  );
};

export default Filtro_Periodo;
