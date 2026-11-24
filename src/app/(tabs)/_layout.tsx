import React from 'react';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClipboardList, SlidersHorizontal, Users, Wallet, Wrench } from 'lucide-react-native';
import { useAuth } from '@/auth/AuthProvider';
import { useI18n } from '@/i18n/I18nProvider';
import { colors, fonts } from '@/theme/tokens';

export default function TabsLayout() {
  const { isOwner } = useAuth();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brandPrimary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontFamily: fonts.bodyMedium,
          fontSize: 11,
          marginTop: 2,
        },
        tabBarStyle: {
          backgroundColor: colors.bgSurface,
          borderTopColor: colors.borderSubtle,
          borderTopWidth: 1,
          height: 56 + bottomInset,
          paddingTop: 6,
          paddingBottom: bottomInset,
        },
      }}
    >
      <Tabs.Screen
        name="workbench"
        options={{
          title: t.tabs.workbench,
          tabBarIcon: ({ color, size }) => <Wrench color={color} size={size - 2} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: t.tabs.orders,
          tabBarIcon: ({ color, size }) => (
            <ClipboardList color={color} size={size - 2} strokeWidth={2} />
          ),
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: t.tabs.customers,
          tabBarIcon: ({ color, size }) => <Users color={color} size={size - 2} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="finance"
        options={{
          title: t.tabs.finance,
          href: isOwner ? '/(tabs)/finance' : null,
          tabBarIcon: ({ color, size }) => <Wallet color={color} size={size - 2} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t.tabs.settings,
          tabBarIcon: ({ color, size }) => (
            <SlidersHorizontal color={color} size={size - 2} strokeWidth={2} />
          ),
        }}
      />
    </Tabs>
  );
}
