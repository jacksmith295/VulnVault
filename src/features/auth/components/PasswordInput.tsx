"use client";

import type { ComponentProps } from "react";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAction } from "@/components/ui/input-group";

type PasswordInputProps = Omit<ComponentProps<typeof Input>, "type">;

export function PasswordInput(props: PasswordInputProps) {
  const [visible, setVisible] = useState(false);
  return (
    <InputGroup>
      <Input {...props} grouped type={visible ? "text" : "password"} />
      <InputGroupAction>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          aria-controls={props.id}
          disabled={props.disabled}
          onClick={() => setVisible(!visible)}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </Button>
      </InputGroupAction>
    </InputGroup>
  );
}
