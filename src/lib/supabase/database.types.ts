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
      ajustes_kilometraje: {
        Row: {
          created_at: string
          dias_captura: number[]
          id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          dias_captura?: number[]
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          dias_captura?: number[]
          id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
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
          tipo: string
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
          tipo: string
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
          tipo?: string
          tipo_registro?: string
          total?: number
          unidad_id?: string
        }
        Relationships: []
      }
      cambios_lecturas_kilometraje: {
        Row: {
          accion: string
          autor_nombre: string | null
          created_at: string
          created_by: string | null
          id: string
          kilometraje_anterior: number
          kilometraje_nuevo: number | null
          lectura_id: string
          motivo: string | null
          semana: string
          unidad_id: string
        }
        Insert: {
          accion: string
          autor_nombre?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kilometraje_anterior: number
          kilometraje_nuevo?: number | null
          lectura_id: string
          motivo?: string | null
          semana: string
          unidad_id: string
        }
        Update: {
          accion?: string
          autor_nombre?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          kilometraje_anterior?: number
          kilometraje_nuevo?: number | null
          lectura_id?: string
          motivo?: string | null
          semana?: string
          unidad_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cambios_lecturas_kilometraje_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
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
      correcciones_kilometraje: {
        Row: {
          autor_nombre: string | null
          created_at: string
          created_by: string | null
          fecha: string
          id: string
          kilometraje: number
          kilometraje_anterior: number | null
          motivo: string
          unidad_id: string
        }
        Insert: {
          autor_nombre?: string | null
          created_at?: string
          created_by?: string | null
          fecha: string
          id?: string
          kilometraje: number
          kilometraje_anterior?: number | null
          motivo: string
          unidad_id: string
        }
        Update: {
          autor_nombre?: string | null
          created_at?: string
          created_by?: string | null
          fecha?: string
          id?: string
          kilometraje?: number
          kilometraje_anterior?: number | null
          motivo?: string
          unidad_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "correcciones_kilometraje_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      entradas_taller: {
        Row: {
          created_at: string
          created_by: string | null
          falla: string
          fecha_entrada: string
          fecha_salida: string | null
          id: string
          kilometraje: number | null
          nota_salida: string | null
          reporta_nombre: string | null
          salida_by: string | null
          salida_nombre: string | null
          servicio_salida_id: string | null
          unidad_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          falla: string
          fecha_entrada: string
          fecha_salida?: string | null
          id?: string
          kilometraje?: number | null
          nota_salida?: string | null
          reporta_nombre?: string | null
          salida_by?: string | null
          salida_nombre?: string | null
          servicio_salida_id?: string | null
          unidad_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          falla?: string
          fecha_entrada?: string
          fecha_salida?: string | null
          id?: string
          kilometraje?: number | null
          nota_salida?: string | null
          reporta_nombre?: string | null
          salida_by?: string | null
          salida_nombre?: string | null
          servicio_salida_id?: string | null
          unidad_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "entradas_taller_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "unidades"
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
          moneda: Database["public"]["Enums"]["moneda"]
          monto: number
          monto_usd: number | null
          servicio_id: string
          tipo_cambio: number | null
          updated_at: string
        }
        Insert: {
          categoria_id: string
          concepto?: string | null
          created_at?: string
          created_by?: string
          id?: string
          moneda?: Database["public"]["Enums"]["moneda"]
          monto: number
          monto_usd?: number | null
          servicio_id: string
          tipo_cambio?: number | null
          updated_at?: string
        }
        Update: {
          categoria_id?: string
          concepto?: string | null
          created_at?: string
          created_by?: string
          id?: string
          moneda?: Database["public"]["Enums"]["moneda"]
          monto?: number
          monto_usd?: number | null
          servicio_id?: string
          tipo_cambio?: number | null
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
      lecturas_kilometraje: {
        Row: {
          autor_nombre: string | null
          created_at: string
          created_by: string | null
          fecha: string
          id: string
          kilometraje: number
          semana: string
          unidad_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          autor_nombre?: string | null
          created_at?: string
          created_by?: string | null
          fecha: string
          id?: string
          kilometraje: number
          semana: string
          unidad_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          autor_nombre?: string | null
          created_at?: string
          created_by?: string | null
          fecha?: string
          id?: string
          kilometraje?: number
          semana?: string
          unidad_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lecturas_kilometraje_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      mantenimientos_unidad: {
        Row: {
          activo: boolean
          cada_km: number | null
          cada_meses: number | null
          created_at: string
          created_by: string | null
          desde_fecha: string
          desde_km: number | null
          id: string
          nombre: string
          unidad_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activo?: boolean
          cada_km?: number | null
          cada_meses?: number | null
          created_at?: string
          created_by?: string | null
          desde_fecha: string
          desde_km?: number | null
          id?: string
          nombre: string
          unidad_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activo?: boolean
          cada_km?: number | null
          cada_meses?: number | null
          created_at?: string
          created_by?: string | null
          desde_fecha?: string
          desde_km?: number | null
          id?: string
          nombre?: string
          unidad_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mantenimientos_unidad_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
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
          entrada_taller_id: string | null
          fecha: string
          id: string
          kilometraje: number | null
          lugar: Database["public"]["Enums"]["lugar_servicio"] | null
          mantenimientos: string[]
          motivo_sin_entrada: string | null
          proveedor_id: string | null
          sin_entrada_taller: boolean | null
          taller_id: string | null
          tipo: Database["public"]["Enums"]["tipo_servicio"] | null
          unidad_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string
          descripcion?: string | null
          entrada_taller_id?: string | null
          fecha: string
          id?: string
          kilometraje?: number | null
          lugar?: Database["public"]["Enums"]["lugar_servicio"] | null
          mantenimientos?: string[]
          motivo_sin_entrada?: string | null
          proveedor_id?: string | null
          sin_entrada_taller?: boolean | null
          taller_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_servicio"] | null
          unidad_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          descripcion?: string | null
          entrada_taller_id?: string | null
          fecha?: string
          id?: string
          kilometraje?: number | null
          lugar?: Database["public"]["Enums"]["lugar_servicio"] | null
          mantenimientos?: string[]
          motivo_sin_entrada?: string | null
          proveedor_id?: string | null
          sin_entrada_taller?: boolean | null
          taller_id?: string | null
          tipo?: Database["public"]["Enums"]["tipo_servicio"] | null
          unidad_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "servicios_entrada_taller_id_fkey"
            columns: ["entrada_taller_id"]
            isOneToOne: false
            referencedRelation: "entradas_taller"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicios_entrada_taller_id_fkey"
            columns: ["entrada_taller_id"]
            isOneToOne: false
            referencedRelation: "entradas_taller_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicios_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicios_taller_id_fkey"
            columns: ["taller_id"]
            isOneToOne: false
            referencedRelation: "talleres"
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
      talleres: {
        Row: {
          activo: boolean
          created_at: string
          created_by: string | null
          id: string
          nombre: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          nombre: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          created_by?: string | null
          id?: string
          nombre?: string
          updated_at?: string
        }
        Relationships: []
      }
      tipos_unidad: {
        Row: {
          activo: boolean
          clave: string
          created_at: string
          created_by: string | null
          lleva_kilometraje: boolean
          lleva_largo: boolean
          lleva_operacion: boolean
          nombre: string
          orden: number
          prefijo: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          clave: string
          created_at?: string
          created_by?: string | null
          lleva_kilometraje: boolean
          lleva_largo?: boolean
          lleva_operacion?: boolean
          nombre: string
          orden?: number
          prefijo: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          clave?: string
          created_at?: string
          created_by?: string | null
          lleva_kilometraje?: boolean
          lleva_largo?: boolean
          lleva_operacion?: boolean
          nombre?: string
          orden?: number
          prefijo?: string
          updated_at?: string
        }
        Relationships: []
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
          orden_tipo: number
          placas: string | null
          tipo: string
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
          orden_tipo: number
          placas?: string | null
          tipo: string
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
          orden_tipo?: number
          placas?: string | null
          tipo?: string
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
          {
            foreignKeyName: "unidades_tipo_fkey"
            columns: ["tipo"]
            isOneToOne: false
            referencedRelation: "tipos_unidad"
            referencedColumns: ["clave"]
          },
        ]
      }
      ventas_unidades: {
        Row: {
          created_at: string
          created_by: string | null
          deshecha_at: string | null
          deshecha_by: string | null
          deshecha_nombre: string | null
          fecha_venta: string
          id: string
          motivo_deshacer: string | null
          nota: string | null
          unidad_id: string
          updated_at: string
          vendida_nombre: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deshecha_at?: string | null
          deshecha_by?: string | null
          deshecha_nombre?: string | null
          fecha_venta: string
          id?: string
          motivo_deshacer?: string | null
          nota?: string | null
          unidad_id: string
          updated_at?: string
          vendida_nombre?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deshecha_at?: string | null
          deshecha_by?: string | null
          deshecha_nombre?: string | null
          fecha_venta?: string
          id?: string
          motivo_deshacer?: string | null
          nota?: string | null
          unidad_id?: string
          updated_at?: string
          vendida_nombre?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ventas_unidades_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      entradas_taller_resumen: {
        Row: {
          created_at: string | null
          falla: string | null
          fecha_entrada: string | null
          fecha_salida: string | null
          id: string | null
          nota_salida: string | null
          num_servicios: number | null
          reporta_nombre: string | null
          salida_nombre: string | null
          servicio_salida_id: string | null
          total: number | null
          unidad_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "entradas_taller_unidad_id_fkey"
            columns: ["unidad_id"]
            isOneToOne: false
            referencedRelation: "unidades"
            referencedColumns: ["id"]
          },
        ]
      }
      gastos_detalle: {
        Row: {
          categoria: string | null
          categoria_id: string | null
          concepto: string | null
          created_at: string | null
          created_by: string | null
          fecha: string | null
          id: string | null
          moneda: Database["public"]["Enums"]["moneda"] | null
          monto: number | null
          monto_usd: number | null
          num_comprobantes: number | null
          numero_economico: string | null
          servicio_creado: string | null
          servicio_id: string | null
          tiene_pdf: boolean | null
          tipo_cambio: number | null
          tipo_unidad: string | null
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
          {
            foreignKeyName: "unidades_tipo_fkey"
            columns: ["tipo_unidad"]
            isOneToOne: false
            referencedRelation: "tipos_unidad"
            referencedColumns: ["clave"]
          },
        ]
      }
      servicios_resumen: {
        Row: {
          autor_nombre: string | null
          created_at: string | null
          created_by: string | null
          descripcion: string | null
          editado: boolean | null
          entrada_taller_id: string | null
          fecha: string | null
          id: string | null
          kilometraje: number | null
          lugar: Database["public"]["Enums"]["lugar_servicio"] | null
          mantenimientos: string[] | null
          motivo_sin_entrada: string | null
          num_comprobantes: number | null
          num_gastos: number | null
          proveedor_id: string | null
          sin_entrada_taller: boolean | null
          taller_id: string | null
          tipo: Database["public"]["Enums"]["tipo_servicio"] | null
          total: number | null
          unidad_id: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Relationships: [
          {
            foreignKeyName: "servicios_entrada_taller_id_fkey"
            columns: ["entrada_taller_id"]
            isOneToOne: false
            referencedRelation: "entradas_taller"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicios_entrada_taller_id_fkey"
            columns: ["entrada_taller_id"]
            isOneToOne: false
            referencedRelation: "entradas_taller_resumen"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicios_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "servicios_taller_id_fkey"
            columns: ["taller_id"]
            isOneToOne: false
            referencedRelation: "talleres"
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
          p_lugar?: Database["public"]["Enums"]["lugar_servicio"]
          p_mantenimientos?: string[]
          p_motivo: string
          p_motivo_sin_entrada?: string
          p_proveedor_id: string
          p_salida_taller?: boolean
          p_servicio_id: string
          p_taller_id?: string
          p_tipo?: Database["public"]["Enums"]["tipo_servicio"]
          p_unidad_id: string
        }
        Returns: undefined
      }
      agregar_mantenimiento: {
        Args: {
          p_cada_km: number
          p_cada_meses: number
          p_desde_fecha: string
          p_desde_km: number
          p_nombre: string
          p_otras?: string[]
          p_unidad_id: string
        }
        Returns: {
          numero_economico: string
          resultado: string
          unidad_id: string
        }[]
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
      cambiar_dias_captura_kilometraje: {
        Args: { p_dias: number[] }
        Returns: undefined
      }
      cerrar_sesiones_usuario: { Args: { p_usuario: string }; Returns: number }
      copiar_mantenimientos: {
        Args: { p_destino: string; p_origen: string }
        Returns: number
      }
      corregir_kilometraje: {
        Args: {
          p_fecha: string
          p_kilometraje: number
          p_motivo: string
          p_unidad_id: string
        }
        Returns: string
      }
      corregir_lectura_kilometraje: {
        Args: { p_kilometraje: number; p_lectura_id: string; p_motivo?: string }
        Returns: undefined
      }
      dar_salida_taller: {
        Args: {
          p_entrada_id: string
          p_fecha: string
          p_nota?: string
          p_servicio_id?: string
        }
        Returns: undefined
      }
      deshacer_venta: {
        Args: { p_motivo: string; p_unidad_id: string }
        Returns: undefined
      }
      dias_captura_kilometraje: { Args: never; Returns: number[] }
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
      es_dia_de_captura_semanal: { Args: { p_fecha: string }; Returns: boolean }
      exportar_gastos: {
        Args: {
          p_desde: string
          p_grupo?: string
          p_hasta: string
          p_tipo?: string
        }
        Returns: {
          categoria: string
          concepto: string
          descripcion: string
          fecha: string
          grupo: string
          lugar: Database["public"]["Enums"]["lugar_servicio"]
          moneda: Database["public"]["Enums"]["moneda"]
          monto: string
          monto_usd: string
          numero_economico: string
          proveedor: string
          taller: string
          tipo: string
          tipo_cambio: string
          tipo_servicio: Database["public"]["Enums"]["tipo_servicio"]
        }[]
      }
      filtro_gastos: {
        Args: {
          p_busqueda: string
          p_desde: string
          p_hasta: string
          p_numero: string
          p_unidad_id: string
        }
        Returns: string
      }
      gastos_para_reporte: {
        Args: {
          p_desde: string
          p_grupo: string
          p_hasta: string
          p_tipo: string
        }
        Returns: {
          categoria: string
          categoria_id: string
          concepto: string
          descripcion: string
          fecha: string
          gasto_id: string
          grupo: string
          lugar: Database["public"]["Enums"]["lugar_servicio"]
          moneda: Database["public"]["Enums"]["moneda"]
          monto: number
          monto_usd: number
          numero_economico: string
          numero_orden: number
          proveedor: string
          proveedor_id: string
          servicio_id: string
          taller: string
          taller_id: string
          tipo: string
          tipo_cambio: number
          tipo_servicio: Database["public"]["Enums"]["tipo_servicio"]
          unidad_id: string
        }[]
      }
      inicio_semana: { Args: { p_fecha: string }; Returns: string }
      kilometraje_unidades: {
        Args: { p_unidad_id?: string }
        Returns: {
          fecha: string
          fuente: string
          kilometraje: number
          unidad_id: string
        }[]
      }
      lecturas_semana: {
        Args: never
        Returns: {
          kilometraje: number
          kilometraje_fecha: string
          kilometraje_fuente: string
          lectura_autor: string
          lectura_created_at: string
          lectura_created_by: string
          lectura_id: string
          lectura_kilometraje: number
          numero_economico: string
          numero_orden: number
          operacion: Database["public"]["Enums"]["operacion_unidad"]
          orden_tipo: number
          tipo: string
          unidad_id: string
        }[]
      }
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
          moneda: Database["public"]["Enums"]["moneda"] | null
          monto: number | null
          monto_usd: number | null
          num_comprobantes: number | null
          numero_economico: string | null
          servicio_creado: string | null
          servicio_id: string | null
          tiene_pdf: boolean | null
          tipo_cambio: number | null
          tipo_unidad: string | null
          unidad_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "gastos_detalle"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      listar_usuarios: {
        Args: never
        Returns: {
          activo: boolean
          correo: string
          created_at: string
          id: string
          nombre: string
          rol: Database["public"]["Enums"]["rol_usuario"]
          ultimo_acceso: string
        }[]
      }
      mantenimientos_pendientes: {
        Args: { p_unidad_id?: string }
        Returns: {
          cada_km: number
          cada_meses: number
          desde_fecha: string
          desde_km: number
          estado: string
          faltan_dias: number
          faltan_km: number
          id: string
          km_actual: number
          nombre: string
          proxima_fecha: string
          proximo_km: number
          ultima_fecha: string
          ultimo_km: number
          ultimo_servicio_id: string
          unidad_id: string
        }[]
      }
      marcar_unidad_vendida: {
        Args: { p_fecha: string; p_nota?: string; p_unidad_id: string }
        Returns: undefined
      }
      nombre_usuario: { Args: { p_id: string }; Returns: string }
      patron_busqueda: { Args: { p_texto: string }; Returns: string }
      puede_cambiar_lectura: { Args: { p_lectura_id: string }; Returns: string }
      puede_capturar: { Args: never; Returns: boolean }
      puede_ver_todo: { Args: never; Returns: boolean }
      quitar_comprobante: {
        Args: { p_comprobante_id: string; p_motivo: string }
        Returns: string
      }
      quitar_lectura_kilometraje: {
        Args: { p_lectura_id: string; p_motivo?: string }
        Returns: undefined
      }
      registrar_entrada_taller: {
        Args: {
          p_falla: string
          p_fecha: string
          p_kilometraje?: number
          p_unidad_id: string
        }
        Returns: string
      }
      registrar_lecturas_kilometraje: {
        Args: { p_lecturas: Json }
        Returns: {
          error: string
          lectura_id: string
          unidad_id: string
        }[]
      }
      registrar_servicio: {
        Args: {
          p_descripcion: string
          p_entrada_falla?: string
          p_entrada_fecha?: string
          p_fecha: string
          p_gastos: Json
          p_kilometraje: number
          p_lugar?: Database["public"]["Enums"]["lugar_servicio"]
          p_mantenimientos?: string[]
          p_motivo_sin_entrada?: string
          p_proveedor_id: string
          p_salida_taller?: boolean
          p_taller_id?: string
          p_tipo?: Database["public"]["Enums"]["tipo_servicio"]
          p_unidad_id: string
        }
        Returns: string
      }
      reporte_gastos: {
        Args: {
          p_anterior_desde?: string
          p_anterior_hasta?: string
          p_desde: string
          p_grupo?: string
          p_hasta: string
          p_limite_ranking?: number
          p_tipo?: string
        }
        Returns: Json
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
      tipo_lleva_kilometraje: { Args: { p_tipo: string }; Returns: boolean }
      validar_kilometraje: {
        Args: {
          p_entrada_id?: string
          p_fecha: string
          p_kilometraje: number
          p_lectura_id?: string
          p_servicio_id?: string
          p_unidad_id: string
        }
        Returns: undefined
      }
      validar_reporte: {
        Args: { p_desde: string; p_grupo: string; p_hasta: string }
        Returns: undefined
      }
    }
    Enums: {
      accion_historial: "insert" | "update" | "delete"
      estatus_unidad: "activo" | "en_taller" | "por_llegar" | "baja" | "vendida"
      lugar_servicio: "taller_propio" | "taller_externo" | "en_camino"
      moneda: "MXN" | "USD"
      operacion_unidad: "local" | "foraneo"
      rol_usuario: "admin" | "capturista" | "gerente"
      tipo_servicio: "preventivo" | "correctivo" | "servicio"
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
      estatus_unidad: ["activo", "en_taller", "por_llegar", "baja", "vendida"],
      lugar_servicio: ["taller_propio", "taller_externo", "en_camino"],
      moneda: ["MXN", "USD"],
      operacion_unidad: ["local", "foraneo"],
      rol_usuario: ["admin", "capturista", "gerente"],
      tipo_servicio: ["preventivo", "correctivo", "servicio"],
    },
  },
} as const
