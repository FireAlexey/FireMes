import { View, Text, TouchableOpacity } from 'react-native'
import { useRouter } from 'expo-router'

export default function NotFound() {
  const router = useRouter()

  return (
    <View style={{
      flex: 1,
      backgroundColor: '#fffbfe',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 32
    }}>
      {/* Иконка */}
      <View style={{
        width: 100, height: 100, borderRadius: 24,
        backgroundColor: '#eaddff',
        justifyContent: 'center', alignItems: 'center',
        marginBottom: 24
      }}>
        <Text style={{ fontSize: 48 }}>✉</Text>
      </View>

      <Text style={{
        fontSize: 24, fontWeight: '700',
        color: '#1c1b1f', marginBottom: 8, letterSpacing: -0.3
      }}>
        FireMes
      </Text>

      <Text style={{
        fontSize: 15, color: '#49454f',
        textAlign: 'center', marginBottom: 40, lineHeight: 22
      }}>
        Страница не найдена
      </Text>

      <TouchableOpacity
        onPress={() => router.replace('/')}
        style={{
          backgroundColor: '#6750a4',
          paddingHorizontal: 32, paddingVertical: 14,
          borderRadius: 100,
          elevation: 2
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>
          Открыть FireMes
        </Text>
      </TouchableOpacity>
    </View>
  )
}