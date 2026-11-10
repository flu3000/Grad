import React, { memo, useEffect, useState } from 'react';
import { Marker } from 'react-native-maps';
import { useTheme } from 'styled-components/native';
import { INFO_UNIDADE, type Unidade } from '../../../lib/unidades';
import * as S from './styles';

interface Props {
  unidade: Unidade;
  selecionada: boolean;
  onSelecionar: (u: Unidade) => void;
}

/** Marcador redondo com o ícone da força (PM, Polícia Civil, GCM ou Bombeiros). */
const Marcador_Unidade = ({ unidade, selecionada, onSelecionar }: Props) => {
  const theme = useTheme();
  const Icone = INFO_UNIDADE[unidade.tipo].icone;
  // No Android, marcadores com visual próprio precisam acompanhar mudanças até desenhar o ícone; depois param
  // de acompanhar para não pesar no mapa com centenas de marcadores.
  const [acompanhar, setAcompanhar] = useState(true);
  useEffect(() => {
    setAcompanhar(true);
    const t = setTimeout(() => setAcompanhar(false), 600);
    return () => clearTimeout(t);
  }, [selecionada, theme.esquema]);

  return (
    <Marker
      coordinate={{ latitude: unidade.latitude, longitude: unidade.longitude }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={acompanhar}
      zIndex={selecionada ? 3 : 2}
      onPress={() => onSelecionar(unidade)}
      accessibilityLabel={`${INFO_UNIDADE[unidade.tipo].rotulo}: ${unidade.nome}`}
    >
      <S.Pino $cor={theme.colors.unidades[unidade.tipo]} $selecionada={selecionada}>
        <Icone color={theme.colors.onUnidade} size={selecionada ? 18 : 14} strokeWidth={2.4} />
      </S.Pino>
    </Marker>
  );
};

export default memo(Marcador_Unidade);
