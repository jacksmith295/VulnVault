"use client";
import { useTheme } from "next-themes";
import {
  Menu,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from "@/components/ui/menu";
export function ThemeSelector() {
  const { theme, setTheme } = useTheme();
  return (
    <Menu>
      <MenuTrigger aria-label="Theme">Theme</MenuTrigger>
      <MenuPopup align="end" aria-label="Theme">
        <MenuRadioGroup
          value={theme ?? ""}
          onValueChange={(value: string) => setTheme(value)}
        >
          <MenuRadioItem value="light">Light</MenuRadioItem>
          <MenuRadioItem value="dark">Dark</MenuRadioItem>
          <MenuRadioItem value="system">System</MenuRadioItem>
        </MenuRadioGroup>
      </MenuPopup>
    </Menu>
  );
}
