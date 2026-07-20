import React from "react";
import { View, StyleSheet, TouchableOpacity } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import { COLORS } from "@/src/theme";

function CustomTabBar({ state, navigation }: any) {
  return (
    <SafeAreaView edges={["bottom"]} style={styles.wrap} pointerEvents="box-none">
      <View style={styles.pill}>
        {state.routes.map((route: any, idx: number) => {
          const isFocused = state.index === idx;
          const icon =
            route.name === "home" ? (isFocused ? "flame" : "flame-outline") :
            route.name === "wall" ? (isFocused ? "grid" : "grid-outline") :
            (isFocused ? "person" : "person-outline");
          return (
            <TouchableOpacity
              key={route.key}
              testID={`tab-${route.name}`}
              onPress={() => { if (!isFocused) navigation.navigate(route.name); }}
              style={styles.tab}
              activeOpacity={0.85}
            >
              <Ionicons name={icon as any} size={24} color={isFocused ? COLORS.gold : COLORS.gray1} />
              {isFocused && <View style={styles.dot} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: COLORS.void } }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen name="home" />
      <Tabs.Screen name="wall" />
      <Tabs.Screen name="me" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", left: 0, right: 0, bottom: 0, alignItems: "center", paddingBottom: 12 },
  pill: {
    width: 240,
    height: 62,
    borderRadius: 999,
    backgroundColor: COLORS.surface2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    borderWidth: 1,
    borderColor: COLORS.gold + "22",
    shadowColor: "#000",
    shadowOpacity: 0.6,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 18,
  },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", height: "100%" },
  dot: { width: 5, height: 5, borderRadius: 999, marginTop: 4, backgroundColor: COLORS.gold },
});
