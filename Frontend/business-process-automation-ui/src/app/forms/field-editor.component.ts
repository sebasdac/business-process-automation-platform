import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { LoadingSpinnerComponent } from '../shared/components/loading-spinner/loading-spinner.component';
import { FIELD_TYPES, FieldType, FormDefinition, FormField, SaveFormFieldRequest } from './form.model';
import { FormService } from './form.service';

@Component({
  selector: 'app-field-editor',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, LoadingSpinnerComponent],
  templateUrl: './field-editor.component.html',
  styleUrl: './field-editor.component.css'
})
export class FieldEditorComponent implements OnInit {
  applicationId!: number;
  formId!: number;

  readonly form = signal<FormDefinition | null>(null);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly fieldTypes = FIELD_TYPES;

  showFieldEditor = false;
  editingFieldId: number | null = null;
  saving = false;

  private readonly fb = inject(FormBuilder);

  readonly fieldForm = this.fb.group({
    fieldName: ['', [Validators.required, Validators.maxLength(100)]],
    label: ['', [Validators.required, Validators.maxLength(200)]],
    fieldType: ['Text' as FieldType, Validators.required],
    isRequired: [false],
    defaultValue: [''],
    minLength: [null as number | null],
    maxLength: [null as number | null],
    min: [null as number | null],
    max: [null as number | null],
    pattern: [''],
    optionsCsv: ['']
  });

  constructor(
    private readonly route: ActivatedRoute,
    private readonly formService: FormService
  ) {}

  get needsOptions(): boolean {
    const type = this.fieldForm.value.fieldType;
    return type === 'Dropdown' || type === 'Radio';
  }

  get needsLengthRules(): boolean {
    const type = this.fieldForm.value.fieldType;
    return type === 'Text' || type === 'Textarea';
  }

  get needsRangeRules(): boolean {
    return this.fieldForm.value.fieldType === 'Number';
  }

  ngOnInit(): void {
    this.applicationId = Number(this.route.snapshot.paramMap.get('id'));
    this.formId = Number(this.route.snapshot.paramMap.get('formId'));
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.formService.getById(this.formId).subscribe({
      next: (response) => {
        this.loading.set(false);
        if (response.success && response.data) {
          this.form.set(response.data);
        }
      },
      error: () => {
        this.loading.set(false);
        this.errorMessage.set('Failed to load form.');
      }
    });
  }

  toggleStatus(): void {
    const current = this.form();
    if (!current) return;
    this.formService.setStatus(current.id, !current.isActive).subscribe({ next: (r) => r.data && this.form.set(r.data) });
  }

  openAddField(): void {
    this.editingFieldId = null;
    this.fieldForm.reset({ fieldType: 'Text', isRequired: false, defaultValue: '', optionsCsv: '' });
    this.showFieldEditor = true;
  }

  openEditField(field: FormField): void {
    this.editingFieldId = field.id;
    this.fieldForm.reset({
      fieldName: field.fieldName,
      label: field.label,
      fieldType: field.fieldType,
      isRequired: field.isRequired,
      defaultValue: field.defaultValue ?? '',
      minLength: field.validationRules?.minLength ?? null,
      maxLength: field.validationRules?.maxLength ?? null,
      min: field.validationRules?.min ?? null,
      max: field.validationRules?.max ?? null,
      pattern: field.validationRules?.pattern ?? '',
      optionsCsv: field.validationRules?.options?.join(', ') ?? ''
    });
    this.showFieldEditor = true;
  }

  cancelFieldEditor(): void {
    this.showFieldEditor = false;
    this.editingFieldId = null;
  }

  saveField(): void {
    if (this.fieldForm.invalid) {
      this.fieldForm.markAllAsTouched();
      return;
    }

    const value = this.fieldForm.getRawValue();
    const request: SaveFormFieldRequest = {
      fieldName: value.fieldName!,
      label: value.label!,
      fieldType: value.fieldType!,
      isRequired: value.isRequired!,
      defaultValue: value.defaultValue || null,
      validationRules: {
        minLength: this.needsLengthRules ? value.minLength : null,
        maxLength: this.needsLengthRules ? value.maxLength : null,
        min: this.needsRangeRules ? value.min : null,
        max: this.needsRangeRules ? value.max : null,
        pattern: this.needsLengthRules && value.pattern ? value.pattern : null,
        options: this.needsOptions && value.optionsCsv
          ? value.optionsCsv.split(',').map((o) => o.trim()).filter((o) => o.length > 0)
          : null
      }
    };

    this.saving = true;
    const save$ = this.editingFieldId
      ? this.formService.updateField(this.editingFieldId, request)
      : this.formService.addField(this.formId, request);

    save$.subscribe({
      next: (response) => {
        this.saving = false;
        this.showFieldEditor = false;
        if (response.success && response.data) {
          this.form.set(response.data);
        }
      },
      error: () => {
        this.saving = false;
        this.errorMessage.set('Failed to save field.');
      }
    });
  }

  deleteField(field: FormField): void {
    this.formService.deleteField(field.id).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.form.set(response.data);
        }
      },
      error: () => this.errorMessage.set('Failed to delete field.')
    });
  }

  moveField(field: FormField, direction: -1 | 1): void {
    const current = this.form();
    if (!current) return;

    const sorted = [...current.fields].sort((a, b) => a.displayOrder - b.displayOrder);
    const index = sorted.findIndex((f) => f.id === field.id);
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= sorted.length) return;

    [sorted[index], sorted[targetIndex]] = [sorted[targetIndex], sorted[index]];

    this.formService.reorderFields(this.formId, sorted.map((f) => f.id)).subscribe({
      next: (response) => {
        if (response.success && response.data) {
          this.form.set(response.data);
        }
      },
      error: () => this.errorMessage.set('Failed to reorder fields.')
    });
  }
}
