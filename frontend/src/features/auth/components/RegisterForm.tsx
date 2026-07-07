"use client";

import Link from "next/link";
import { EyeOff } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { registerSchema, type RegisterFormData } from "@/features/auth/schemas/register";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function RegisterForm() {
    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<RegisterFormData>({
        resolver: zodResolver(registerSchema),
        defaultValues: {
            fullName: "",
            email: "",
            password: "",
            confirmPassword: "",
        },
    });

    const onSubmit = (data: RegisterFormData) => {
        console.log(data);
    };

    return (
        <Card className="w-full max-w-md shadow-md">
            <CardHeader>
                <CardTitle className="text-4xl font-semibold">
                    Register for VulnVault
                </CardTitle>

                <CardDescription className="text-base">
                    Enter your details to get started with VulnVault
                </CardDescription>
            </CardHeader>

            <CardContent>
                <form
                    onSubmit={handleSubmit(onSubmit)}
                    className="space-y-6"
                >
                    <div className="space-y-2">
                        <Label htmlFor="fullName">Full Name</Label>

                        <Input
                            id="fullName"
                            placeholder="John Doe"
                            {...register("fullName")}
                        />

                        {errors.fullName && (
                            <p className="text-sm text-destructive">
                                {errors.fullName.message}
                            </p>
                        )}
                    </div>

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

                            <EyeOff className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 cursor-pointer text-muted-foreground" />
                        </div>

                        {errors.password && (
                            <p className="text-sm text-destructive">
                                {errors.password.message}
                            </p>
                        )}
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="confirmPassword">
                            Confirm Password
                        </Label>

                        <div className="relative">
                            <Input
                                id="confirmPassword"
                                type="password"
                                className="pr-10"
                                {...register("confirmPassword")}
                            />

                            <EyeOff className="absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 cursor-pointer text-muted-foreground" />
                        </div>

                        {errors.confirmPassword && (
                            <p className="text-sm text-destructive">
                                {errors.confirmPassword.message}
                            </p>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <Link href="/login" className="w-full">
                            <Button
                                type="button"
                                variant="outline"
                                className="h-12 w-full rounded-xl text-lg"
                            >
                                Go to Login
                            </Button>
                        </Link>

                        <Button
                            type="submit"
                            className="h-12 rounded-xl text-lg"
                        >
                            Register
                        </Button>
                    </div>
                </form>
            </CardContent>
        </Card>
    );
}