import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerTransparent: true,
          headerShadowVisible: false,
          headerLargeTitle: true,
          headerLargeTitleShadowVisible: false,
          headerLargeStyle: { backgroundColor: 'transparent' },
          headerBlurEffect: 'systemChromeMaterialDark',
          headerTitleStyle: { color: '#fafafa' },
          headerBackButtonDisplayMode: 'minimal',
          contentStyle: { backgroundColor: '#0b0b0b' },
        }}
      />
    </SafeAreaProvider>
  );
}
