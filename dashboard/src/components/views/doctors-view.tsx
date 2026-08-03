// /home/z/my-project/src/components/views/doctors-view.tsx
'use client'

import { useEffect, useState, useCallback } from 'react'
import { useApp } from '../providers'
import { api } from '@/lib/api-client'
import { Card, CardContent } from '../ui/card'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Switch } from '../ui/switch'
import { Skeleton } from '../ui/skeleton'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '../ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog'
import { Plus, Stethoscope, Pencil, Trash2, Star, Phone, Mail, Calendar, Users } from 'lucide-react'
import { toast } from 'sonner'
import { z } from 'zod'

interface Doctor {
  id: string
  fullName: string
  specialization: string
  phone: string | null
  email: string | null
  fee: number
  rating: number
  isActive: boolean
  createdAt: string
  _count?: { schedules: number; appointments: number }
}

const doctorSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  specialization: z.string().trim().min(2).max(80),
  phone: z.string().trim().regex(/^\+?[0-9]{10,15}$/).optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  fee: z.coerce.number().int().min(0).max(100000),
  rating: z.coerce.number().min(0).max(5),
  isActive: z.boolean(),
})

type DoctorForm = z.infer<typeof doctorSchema>

const emptyForm: DoctorForm = {
  fullName: '',
  specialization: '',
  phone: '',
  email: '',
  fee: 500,
  rating: 0,
  isActive: true,
}

export function DoctorsView() {
  const { t, lang, user } = useApp()
  const isAdmin = user?.role === 'SUPER_ADMIN'

  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Doctor | null>(null)
  const [form, setForm] = useState<DoctorForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const fetchDoctors = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api<{ doctors: Doctor[] }>('/api/doctors')
      setDoctors(data.doctors)
    } catch {
      toast.error(t('error'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    fetchDoctors()
  }, [fetchDoctors])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setOpen(true)
  }

  const openEdit = (d: Doctor) => {
    setEditing(d)
    setForm({
      fullName: d.fullName,
      specialization: d.specialization,
      phone: d.phone || '',
      email: d.email || '',
      fee: d.fee,
      rating: d.rating,
      isActive: d.isActive,
    })
    setOpen(true)
  }

  const save = async () => {
    setSaving(true)
    try {
      const parsed = doctorSchema.parse(form)
      if (editing) {
        await api(`/api/doctors/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify(parsed),
        })
        toast.success(t('updated'))
      } else {
        await api('/api/doctors', {
          method: 'POST',
          body: JSON.stringify(parsed),
        })
        toast.success(t('saved'))
      }
      setOpen(false)
      fetchDoctors()
    } catch (e) {
      const err = e as Error
      toast.error(err.message || t('error'))
    } finally {
      setSaving(false)
    }
  }

  const doDelete = async () => {
    if (!deleteId) return
    try {
      await api(`/api/doctors/${deleteId}`, { method: 'DELETE' })
      toast.success(t('deleted'))
      setDeleteId(null)
      fetchDoctors()
    } catch {
      toast.error(t('error'))
    }
  }

  return (
    <div className="space-y-5 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{t('doctorManagement')}</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {doctors.length} {t('doctors').toLowerCase()}
          </p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate} className="gap-2 self-start">
            <Plus className="w-4 h-4" />
            {t('addNewDoctor')}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      ) : doctors.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-12 text-center">
            <Stethoscope className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
            <h3 className="text-lg font-semibold mb-1">{t('noDoctors')}</h3>
            <p className="text-muted-foreground text-sm">{t('noDoctorsDesc')}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {doctors.map((d) => (
            <Card key={d.id} className="overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 ${d.isActive ? 'bg-primary' : 'bg-muted-foreground'}`}>
                    {d.fullName.split(' ').slice(-2).map((n) => n[0]).join('').toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{d.fullName}</h3>
                    <p className="text-xs text-muted-foreground">{d.specialization}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                      <span className="text-xs font-medium">{d.rating.toFixed(1)}</span>
                      <span className="text-xs text-muted-foreground">· ₹{d.fee}</span>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 text-[10px] rounded-full uppercase tracking-wider ${d.isActive ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' : 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400'}`}>
                    {d.isActive ? t('active') : t('inactive')}
                  </span>
                </div>

                <div className="space-y-1.5 text-xs text-muted-foreground border-t border-border pt-3">
                  {d.phone && (
                    <p className="flex items-center gap-2 truncate">
                      <Phone className="w-3.5 h-3.5" />
                      {d.phone}
                    </p>
                  )}
                  {d.email && (
                    <p className="flex items-center gap-2 truncate">
                      <Mail className="w-3.5 h-3.5" />
                      {d.email}
                    </p>
                  )}
                  <div className="flex items-center gap-4 pt-1">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      {d._count?.schedules || 0} {t('totalSchedules').toLowerCase()}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" />
                      {d._count?.appointments || 0} {t('totalAppts').toLowerCase()}
                    </span>
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex gap-2 pt-2 border-t border-border">
                    <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={() => openEdit(d)}>
                      <Pencil className="w-3.5 h-3.5" />
                      {t('edit')}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                      onClick={() => setDeleteId(d.id)}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? t('editDoctor') : t('addNewDoctor')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2">
              <Label>{t('fullName')}</Label>
              <Input
                value={form.fullName}
                onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                placeholder="Dr. John Doe"
              />
            </div>
            <div className="space-y-2">
              <Label>{t('specialization')}</Label>
              <Input
                value={form.specialization}
                onChange={(e) => setForm({ ...form, specialization: e.target.value })}
                placeholder="Cardiology"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('phone')}</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  placeholder="+8801712345678"
                />
              </div>
              <div className="space-y-2">
                <Label>{t('email')}</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="doctor@clinic.com"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('fee')} (₹)</Label>
                <Input
                  type="number"
                  value={form.fee}
                  onChange={(e) => setForm({ ...form, fee: parseInt(e.target.value) || 0 })}
                  min={0}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('rating')}</Label>
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max="5"
                  value={form.rating}
                  onChange={(e) => setForm({ ...form, rating: parseFloat(e.target.value) || 0 })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-3">
              <Label htmlFor="doc-active">{t('active')}</Label>
              <Switch
                id="doc-active"
                checked={form.isActive}
                onCheckedChange={(c) => setForm({ ...form, isActive: c })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t('cancelBtn')}</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? t('saving') : t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('delete')}?</AlertDialogTitle>
            <AlertDialogDescription>{t('confirmDeleteDoctor')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancelBtn')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={doDelete}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {t('delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
