import { StatusBar } from 'expo-status-bar';
import ChatScreen from './app/(tabs)/index';

export default function App() {
  return (
    <>
      <ChatScreen />
      <StatusBar style="auto" />
    </>
  );
}
