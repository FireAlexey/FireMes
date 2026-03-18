import { Slot } from 'expo-router'
import { View, Platform } from 'react-native'
import { useEffect } from 'react'

export default function RootLayout() {
  useEffect(() => {
    if (Platform.OS === 'web') {
      document.title = 'FireMes'
    }
  }, [])

  return (
    <View style={{ flex: 1 }}>
      <Slot />
    </View>
  )
}