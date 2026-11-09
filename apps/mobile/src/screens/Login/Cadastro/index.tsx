import * as S from './styles';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import Text_Input from '../../../components/Login/Text_Input';
// import axios from 'axios';
// import api from '@services/api';
// import useAuth from '@hooks/useAuth';

const Cadastro = () => {
    const [password, setPassword] = useState('');
    const [email, setEmail] = useState('');

    return (
        <S.Wrapper>
            <S.AppHeaderContainer>
                <S.LogoText>Grad</S.LogoText>
            </S.AppHeaderContainer>
            <S.MainContainer>
                <S.MainHeadText>Crie uma conta</S.MainHeadText>
                <Text_Input
                    placeholder='Email'
                    keyboardType='email-address'
                    textContentType='emailAddress'
                    autoComplete='email'
                    inputMode='email'
                />
                <Text_Input
                    placeholder='Senha'
                    isPassword={true}
                    keyboardType='default'
                    textContentType='password'
                    autoComplete='password'
                    inputMode='text'
                />
            </S.MainContainer>
        </S.Wrapper>
    );
};

export default Cadastro;
