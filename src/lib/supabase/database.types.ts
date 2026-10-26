export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      bitacora_eliminaciones: {
        Row: {
          autor_nombre: string | null
          created_at: string
          created_by: string | null
          fecha_servicio: string | null
          id: number
          num_gastos: number
          num_servicios: number
          numero_economico: string
          servicio_id: string | null
          tipo: Database["public"]["Enums"]["tipo_unidad"]
          tipo_registro: string
          total: number
          unidad_id: string
        }
        Insert: {
          autor_nombre?: string | null
          created_at?: string
          created_by?: string | null
          fecha_servicio?: string | null
          id?: never
          num_gastos: number
          num_servicios: number
          numero_economico: string
          servicio_id?: string | null
          tipo: Database["public"]["Enums"]["tipo_unidad"]
          tipo_registro?: string
          total: number
          unidad_id: string
        }
        Update: {
          autor_nombre?: string | null
          created_at?: string
          created_by?: string | null
          fecha_servicio?: string | null
          id?: never
          num_gastos?: number
          num_servicios?: number
          numero_economico?: string
          servicio_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_unidad"]
          tipo_registro?: string
          total?: number
          unidad_id?: string
        }
        Relationships: []
      }
      categorias: {
        Row: {
          activo: boolean
          created_at: string
          created_by: string | null
          id: string
          nombre: string
          requiere_concepto: boolean
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          nombre: string
          requiere_concepto?: boolean
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          nombre?: string
          requiere_concepto?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      choferes: {
        Row: {
          activo: boolean
          created_at: string
          created_by: string | null
          id: string
          nombre: string
          telefono: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          nombre: string
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          nombre?: string
          telefono?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      comprobantes: {
        Row: {
          created_at: string
          created_by: string
          hash_sha256: string
          id: string
          nombre_archivo: string
          ruta_archivo: string
          servicio_id: string
          tamano_bytes: number
          tipo_mime: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          hash_sha256: string
          id?: string
          nombre_archivo: string
          ruta_archivo: string
          servicio_id: string
          tamano_bytes: number
          tipo_mime: string
        }
        Update: {
          created_at?: string
          created_by?: string
          hash_sha256?: string
          id?: string
          nombre_archivo?: string
          ruta_archivo?: string
          servicio_id?: string
          tamano_bytes?: number
          tipo_mime?: string
        }
        Relationships: [
          {
            foreignKeyName: "comprobantes_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comprobantes_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios_resumen"
            referencedColumns: ["id"]
          },
        ]
      }
      gastos: {
        Row: {
          categoria_id: string
          concepto: string | null
          created_at: string
          created_by: string
          id: string
          monto: number
          servicio_id: string
          updated_at: string
        }
        Insert: {
          categoria_id: string
          concepto?: string | null
          created_at?: string
          created_by?: string
          id?: string
          monto: number
          servicio_id: string
          updated_at?: string
        }
        Update: {
          categoria_id?: string
          concepto?: string | null
          created_at?: string
          created_by?: string
          id?: string
          monto?: number
          servicio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gastos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios_resumen"
            referencedColumns: ["id"]
          },
        ]
      }
      historial_cambios: {
        Row: {
          accion: Database["public"]["Enums"]["accion_historial"]
          autor_nombre: string | null
          created_at: string
          created_by: string | null
          datos_anteriores: Json | null
          datos_nuevos: Json | null
          dueno_id: string
          id: number
          motivo: string | null
          registro_id: string
          servicio_id: string
          tabla: string
        }
        Insert: {
          accion: Database["public"]["Enums"]["accion_historial"]
          autor_nombre?: string | null
          created_at?: string
          created_by?: string | null
          datos_anteriores?: Json | null
          datos_nuevos?: Json | null
          dueno_id: string
          id?: never
          motivo?: string | null
          registro_id: string
          servicio_id: string
          tabla: string
        }
        Update: {
          accion?: Database["public"]["Enums"]["accion_historial"]
          autor_nombre?: string | null
          created_at?: string
          created_by?: string | null
          datos_anteriores?: Json | null
          datos_nuevos?: Json | null
          dueno_id?: string
          id?: never
          motivo?: string | null
          registro_id?: string
          servicio_id?: string
          tabla?: string
        }
        Relationships: []
      }
      perfiles: {
        Row: {
          activo: boolean
          created_at: string
          created_by: string | null
          id: string
          nombre: string
          rol: Database["public"]["Enums"]["rol_usuario"]
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          id: string
          nombre: string
          rol?: Database["public"]["Enums"]["rol_usuario"]
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          nombre?: string
          rol?: Database["public"]["Enums"]["rol_usuario"]
          updated_at?: string
        }
        Relationships: []
      }
      proveedores: {
        Row: {
          activo: boolean
          created_at: string
          created_by: string | null
          id: string
          nombre: string
          notas: string | null
          telefono: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          nombre: string
          notas?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          nombre?: string
          notas?: string | null
          telefono?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      servicios: {
        Row: {
          created_at: string
          created_by: string
          descripcion: string | null
          fecha: string
          id: string
          kilometraje: number | null
          proveedor_id: string | null
          unidad_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          descripcion?: string | null
          fecha: string
          id?: string
          kilometraje?: number | null
          proveedor_id?: string | null
          unidad_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          descripcion?: string | null
          fecha?: string
          id?: string
          kilometraje?: number | null
          proveedor_id?: string | null
          unidad_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "servicios_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicios_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      unidades: {
        Row: {
          anio: number | null
          chofer_id: string | null
          created_at: string
          created_by: string | null
          estatus: Database["public"]["Enums"]["estatus_unidad"]
          id: string
          longitud_pies: number | null
          marca: string | null
          modelo: string | null
          notas: string | null
          numero_economico: string
          numero_orden: number | null
          operacion: Database["public"]["Enums"]["operacion_unidad"] | null
          placas: string | null
          tipo: Database["public"]["Enums"]["tipo_unidad"]
          updated_at: string
          vin: string | null
        }
        Insert: {
          anio?: number | null
          chofer_id?: string | null
          created_at?: string
          created_by?: string | null
          estatus?: Database["public"]["Enums"]["estatus_unidad"]
          id?: string
          longitud_pies?: number | null
          marca?: string | null
          modelo?: string | null
          notas?: string | null
          numero_economico: string
          numero_orden?: number | null
          operacion?: Database["public"]["Enums"]["operacion_unidad"] | null
          placas?: string | null
          tipo: Database["public"]["Enums"]["tipo_unidad"]
          updated_at?: string
          vin?: string | null
        }
        Update: {
          anio?: number | null
          chofer_id?: string | null
          created_at?: string
          created_by?: string | null
          estatus?: Database["public"]["Enums"]["estatus_unidad"]
          id?: string
          longitud_pies?: number | null
          marca?: string | null
          modelo?: string | null
          notas?: string | null
          numero_economico?: string
          numero_orden?: number | null
          operacion?: Database["public"]["Enums"]["operacion_unidad"] | null
          placas?: string | null
          tipo?: Database["public"]["Enums"]["tipo_unidad"]
          updated_at?: string
          vin?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unidades_chofer_id_fkey"
            columns: ["chofer_id"]
            isOneToOne: false
            referencedRelation: "choferes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      gastos_detalle: {
        Row: {
          categoria: string | null
          categoria_id: string | null
          concepto: string | null
          created_at: string | null
          created_by: string | null
          fecha: string | null
          id: string | null
          monto: number | null
          num_comprobantes: number | null
          numero_economico: string | null
          servicio_creado: string | null
          servicio_id: string | null
          tiene_pdf: boolean | null
          tipo_unidad: Database["public"]["Enums"]["tipo_unidad"] | null
          unidad_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gastos_categoria_id_fkey"
            columns: ["categoria_id"]
            isOneToOne: false
            referencedRelation: "categorias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_servicio_id_fkey"
            columns: ["servicio_id"]
            isOneToOne: false
            referencedRelation: "servicios_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicios_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      servicios_resumen: {
        Row: {
          created_at: string | null
          created_by: string | null
          descripcion: string | null
          editado: boolean | null
          fecha: string | null
          id: string | null
          kilometraje: number | null
          num_gastos: number | null
          proveedor_id: string | null
          total: number | null
          unidad_id: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Relationships: [
          {
            foreignKeyName: "servicios_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicios_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      totales_por_unidad: {
        Row: {
          num_servicios: number | null
          total: number | null
          ultimo_servicio: string | null
          unidad_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "servicios_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      actualizar_servicio: {
        Args: {
          p_descripcion: string
          p_fecha: string
          p_gastos: Json
          p_kilometraje: number
          p_motivo: string
          p_proveedor_id: string
          p_servicio_id: string
          p_unidad_id: string
        }
        Returns: undefined
      }
      archivo_comprobante_en_uso: { Args: { p_ruta: string }; Returns: boolean }
      buscar_comprobante_duplicado: {
        Args: { p_hash: string }
        Returns: {
          fecha: string
          numero_economico: string
          puede_ver: boolean
          servicio_id: string
        }[]
      }
      eliminar_servicio: {
        Args: { p_motivo: string; p_servicio_id: string }
        Returns: undefined
      }
      eliminar_servicio_definitivo: {
        Args: { p_confirmacion: string; p_historial_id: number }
        Returns: string[]
      }
      eliminar_unidad: {
        Args: { p_confirmacion: string; p_unidad_id: string }
        Returns: string[]
      }
      es_admin: { Args: never; Returns: boolean }
      listar_gastos: {
        Args: {
          p_busqueda?: string
          p_desde?: string
          p_desde_renglon?: number
          p_hasta?: string
          p_limite?: number
          p_numero?: string
          p_unidad_id?: string
        }
        Returns: {
          categoria: string | null
          categoria_id: string | null
          concepto: string | null
          created_at: string | null
          created_by: string | null
          fecha: string | null
          id: string | null
          monto: number | null
          num_comprobantes: number | null
          numero_economico: string | null
          servicio_creado: string | null
          servicio_id: string | null
          tiene_pdf: boolean | null
          tipo_unidad: Database["public"]["Enums"]["tipo_unidad"] | null
          unidad_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "gastos_detalle"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      patron_busqueda: { Args: { p_texto: string }; Returns: string }
      prefijo_tipo_unidad: {
        Args: { tipo: Database["public"]["Enums"]["tipo_unidad"] }
        Returns: string
      }
      puede_capturar: { Args: never; Returns: boolean }
      puede_ver_todo: { Args: never; Returns: boolean }
      quitar_comprobante: {
        Args: { p_comprobante_id: string; p_motivo: string }
        Returns: string
      }
      registrar_servicio: {
        Args: {
          p_descripcion: string
          p_fecha: string
          p_gastos: Json
          p_kilometraje: number
          p_proveedor_id: string
          p_unidad_id: string
        }
        Returns: string
      }
      restaurar_servicio: {
        Args: { p_historial_id: number; p_motivo: string }
        Returns: string
      }
      resumen_gastos: {
        Args: {
          p_busqueda?: string
          p_desde?: string
          p_hasta?: string
          p_numero?: string
          p_unidad_id?: string
        }
        Returns: {
          num_gastos: number
          total: number
        }[]
      }
      rol_actual: {
        Args: never
        Returns: Database["public"]["Enums"]["rol_usuario"]
      }
    }
    Enums: {
      accion_historial: "insert" | "update" | "delete"
      estatus_unidad: "activo" | "en_taller" | "por_llegar" | "baja"
      operacion_unidad: "local" | "foraneo"
      rol_usuario: "admin" | "capturista" | "gerente"
      tipo_unidad: "trailer" | "caja" | "camion_rabon" | "pipa" | "camioneta"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      accion_historial: ["insert", "update", "delete"],
      estatus_unidad: ["activo", "en_taller", "por_llegar", "baja"],
      operacion_unidad: ["local", "foraneo"],
      rol_usuario: ["admin", "capturista", "gerente"],
      tipo_unidad: ["trailer", "caja", "camion_rabon", "pipa", "camioneta"],
    },
  },
} as const
