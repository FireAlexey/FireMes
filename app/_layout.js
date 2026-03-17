import { Stack } from 'expo-router'
import { Provider as PaperProvider, MD3DarkTheme } from 'react-native-paper'

export default function RootLayout() {
  return (
    <PaperProvider theme={MD3DarkTheme}>
      <Stack />
    </PaperProvider>
  )
}