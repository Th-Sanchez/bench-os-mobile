import { Redirect } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';

export default function IndexScreen() {
  const { isAuthenticated } = useAuth();
  return <Redirect href={isAuthenticated ? '/(tabs)/workbench' : '/(auth)/login'} />;
}
