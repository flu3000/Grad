import React, { useState } from 'react';
import { ActivityIndicator, Modal } from 'react-native';
import { Check, ChevronDown } from 'lucide-react-native';
import { useTheme } from 'styled-components/native';
import { useFiltro } from '../../../contexts/Filtro_Context';
import { rotuloAno } from '../../../lib/formatacao';
import * as S from './styles';

/** Chip do ano no topo do mapa ("2025 ▾"); abre a lista de anos disponíveis. */
const Seletor_Ano = () => {
  const theme = useTheme();
  const { anos, erroAnos, recarregarAnos, ano, infoAno, setAno } = useFiltro();
  const [aberto, setAberto] = useState(false);

  if (erroAnos && !anos) {
    return (
      <S.Chip onPress={recarregarAnos} accessibilityRole="button" accessibilityLabel="Falha ao carregar os anos. Tocar para tentar de novo">
        <S.ChipTexto>Anos: tentar de novo</S.ChipTexto>
      </S.Chip>
    );
  }
  if (!anos || !infoAno) {
    return (
      <S.Chip disabled accessibilityLabel="Carregando os anos">
        <ActivityIndicator size="small" color={theme.colors.textSecondary} />
      </S.Chip>
    );
  }

  return (
    <>
      <S.Chip
        onPress={() => setAberto(true)}
        accessibilityRole="button"
        accessibilityLabel={`Ano dos dados: ${rotuloAno(infoAno)}. Tocar para trocar`}
      >
        <S.ChipTexto>{rotuloAno(infoAno)}</S.ChipTexto>
        <ChevronDown color={theme.colors.textPrimary} size={16} />
      </S.Chip>
      <Modal visible={aberto} transparent animationType="fade" onRequestClose={() => setAberto(false)}>
        <S.Fundo onPress={() => setAberto(false)} accessibilityRole="button" accessibilityLabel="Fechar a lista de anos">
          {/* toque dentro da lista não fecha */}
          <S.Lista onPress={() => undefined}>
            <S.Titulo>Ano dos dados</S.Titulo>
            {anos.map((a) => {
              const ativo = a.ano === ano;
              return (
                <S.Item
                  key={a.ano}
                  onPress={() => {
                    setAno(a.ano);
                    setAberto(false);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: ativo }}
                  accessibilityLabel={a.completo ? String(a.ano) : `${a.ano}, parcial: ${rotuloAno(a)}`}
                >
                  <S.ItemTextos>
                    <S.ItemTexto $ativo={ativo}>{rotuloAno(a)}</S.ItemTexto>
                    {!a.completo && <S.ItemDetalhe>Ano parcial; a nota é anualizada pela época do ano.</S.ItemDetalhe>}
                  </S.ItemTextos>
                  {ativo && <Check color={theme.colors.accent} size={18} />}
                </S.Item>
              );
            })}
            <S.Rodape>Todos os anos usam a mesma escala, calculada com 2023–2025.</S.Rodape>
          </S.Lista>
        </S.Fundo>
      </Modal>
    </>
  );
};

export default Seletor_Ano;
