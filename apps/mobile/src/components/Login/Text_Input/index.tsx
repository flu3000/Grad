import * as S from './styles';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Eye, EyeOff } from 'lucide-react-native';
// import axios from 'axios';
// import api from '@services/api';
// import useAuth from '@hooks/useAuth';

const Text_Input = ({ placeholder, isPassword = false, textContentType, autoComplete, inputMode, keyboardType }) => {

    const [text, setText] = useState('');
    const [secure, setSecure] = useState(isPassword);

    const handleChangeText = (inputText) => {
        setText(inputText);
    };

    return (
        <S.Wrapper>
            <S.MainContainer>
                <S.TextInput 
                    placeholder={placeholder}
                    keyboardType={keyboardType}
                    value={text}
                    onChangeText={handleChangeText}
                    secureTextEntry={secure}
                    autoCapitalize="none"
                    autoCorrect={false}
                    textContentType={textContentType}
                    autoComplete={autoComplete}
                    inputMode={inputMode}
                />
                
            </S.MainContainer>
        </S.Wrapper>
    );
};

export default Text_Input;
