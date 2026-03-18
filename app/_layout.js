import { Slot } from 'expo-router'
import { View, Platform } from 'react-native'
import { useEffect } from 'react'

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS === 'web') {
      document.title = 'FireMes'
      // Убираем белый фон пока грузится JS
      document.body.style.backgroundColor = '#fffbfe'
      document.documentElement.style.backgroundColor = '#fffbfe'
    }
  }, [])

  return (
    <View style={{ flex: 1, backgroundColor: '#fffbfe' }}>
      <Slot />
    </View>
  )
}