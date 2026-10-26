"use client";

import { EyeOff } from "lucide-react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { loginSchema, type LoginFormData } from "../schemas/login";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginForm() {
    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<LoginFormData>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            email: "",
            password: "",
        },
    });

    const onSubmit = (data: LoginFormData) => {
        console.log(data);
    };

    return (
        <Card className="w-full max-w-md shadow-md">
            <CardHeader>
                <CardTitle className="text-4xl font-semibold">
                    Login to VulnVault
                </CardTitle>
                <CardDescription className="text-base">
                    Enter your email and password to login
                </CardDescription>
            </CardHeader>

            <CardContent>
                <form
                    onSubmit={handleSubmit(onSubmit)}
                    className="space-y-6"
                >
                    <div className="space-y-2">
                        <Label htmlFor="email">Email</Label>
                        <Input
                            id="email"
                            type="email"
                            placeholder="email@example.com"
                            {...register("email")}
                        />

                        {errors.email && (
                            <p className="text-sm text-destructive">
                                {errors.email.message}
                            </p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="password">Password</Label>

                        <div className="relative">
                            <Input
                                id="password"
                                type="password"
                                className="pr-10"
                                {...register("password")}
                            />

                            <EyeOff
                                className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground cursor-pointer"
                            />

                            {errors.password && (
                                <p className="text-sm text-destructive">
                                    {errors.password.message}
                                </p>
                            )}
                        </div>

                        <div className="flex justify-end">
                            <button
                                type="button"
                                className="text-xs text-muted-foreground hover:underline"
                            >
                                Forgotten Password
                            </button>
                        </div>
                    </div>



                    <div className="grid grid-cols-2 gap-4">
                        <Link href="/register" className="w-full">
                            <Button
                                type="button"
                                variant="outline"
                                className="h-12 w-full rounded-xl text-lg"
                            >
                                Register
                            </Button>
                        </Link>

                        <Button
                            type="submit"
                            className="h-12 rounded-xl text-lg"
                        >
                            Login
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}