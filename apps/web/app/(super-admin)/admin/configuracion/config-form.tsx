"use client"

import type { PlatformConfig } from "@cuik/shared/validators"
import { platformConfigSchema } from "@cuik/shared/validators"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2 } from "lucide-react"
import { useTransition } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"

import { saveGlobalConfig } from "./actions"

interface ConfigFormProps {
  initialData: PlatformConfig
}

export function ConfigForm({ initialData }: ConfigFormProps) {
  const [isPending, startTransition] = useTransition()

  const form = useForm<PlatformConfig>({
    resolver: zodResolver(platformConfigSchema),
    defaultValues: initialData,
  })

  function onSubmit(data: PlatformConfig) {
    startTransition(async () => {
      const result = await saveGlobalConfig(data)

      if (result.success) {
        toast.success("Configuración guardada")
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="platformName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nombre de plataforma</FormLabel>
              <FormControl>
                <Input placeholder="Cuik" {...field} />
              </FormControl>
              <FormDescription>Nombre visible en emails y comunicaciones.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="baseUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>URL base</FormLabel>
              <FormControl>
                <Input type="url" placeholder="https://app.cuik.pe" {...field} />
              </FormControl>
              <FormDescription>URL principal de la plataforma.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="supportEmail"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email de soporte</FormLabel>
              <FormControl>
                <Input type="email" placeholder="soporte@cuik.pe" {...field} />
              </FormControl>
              <FormDescription>
                Email que reciben los comercios para contactar soporte.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="defaultTrialDays"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Trial por defecto (dias)</FormLabel>
              <FormControl>
                <Input type="number" min={1} max={90} placeholder="7" {...field} />
              </FormControl>
              <FormDescription>
                Cantidad de dias de prueba al activar un nuevo tenant.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Guardando...
            </>
          ) : (
            "Guardar cambios"
          )}
        </Button>
      </form>
    </Form>
  )
}
