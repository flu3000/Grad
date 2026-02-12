import * as S from './styles';
import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const Bottom_Navigation_Bar = () => {
    const insets = useSafeAreaInsets();

    return (
        <S.Wrapper bottomInset={insets.bottom}>
            <S.MainContainer bottomInset={insets.bottom}>
                <S.NavButton bottomInset={insets.bottom}>

                </S.NavButton>
                <S.NavButton bottomInset={insets.bottom}>
                    
                </S.NavButton>
                <S.NavButton bottomInset={insets.bottom}>
                    
                </S.NavButton>
            </S.MainContainer>
        </S.Wrapper>
    );
};

export default Bottom_Navigation_Bar;
