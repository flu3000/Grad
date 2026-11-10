import 'styled-components';

import type { Cores } from '../theme/colors';

declare module 'styled-components/native' {
  export interface DefaultTheme {
    colors: Cores;
    esquema: 'claro' | 'escuro';
  }
}
