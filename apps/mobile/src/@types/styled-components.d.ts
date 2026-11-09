import 'styled-components';

import colors from '../theme/colors';

declare module 'styled-components/native' {
  export interface DefaultTheme {
    colors: typeof colors;
  }
}
