import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CdkDragDrop } from '@angular/cdk/drag-drop';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { ApiResponse } from '../core/models/api-response.model';
import { FormDefinition, FormField } from './form.model';
import { FormService } from './form.service';
import { FieldEditorComponent } from './field-editor.component';

describe('FieldEditorComponent', () => {
  let fixture: ComponentFixture<FieldEditorComponent>;
  let formService: jasmine.SpyObj<FormService>;
  let currentForm: FormDefinition;

  const createField = (id: number, fieldName: string, label: string, displayOrder: number): FormField => ({
    id,
    fieldName,
    label,
    fieldType: 'Text',
    isRequired: false,
    displayOrder,
    defaultValue: null,
    validationRules: null
  });

  const response = (data: FormDefinition): ApiResponse<FormDefinition> => ({
    success: true,
    data,
    error: null
  });

  beforeEach(async () => {
    currentForm = {
      id: 7,
      name: 'Test form',
      isActive: true,
      applicationId: 3,
      createdDate: '2026-01-01',
      fields: [
        createField(1, 'firstField', 'First field', 1),
        createField(2, 'secondField', 'Second field', 2)
      ]
    };

    formService = jasmine.createSpyObj<FormService>('FormService', [
      'getById',
      'addField',
      'updateField',
      'deleteField',
      'reorderFields',
      'setStatus'
    ]);
    formService.getById.and.returnValue(of(response(currentForm)));
    formService.addField.and.callFake((_formId, request) => {
      const field = {
        ...request,
        id: currentForm.fields.length + 1,
        displayOrder: currentForm.fields.length + 1,
        defaultValue: request.defaultValue ?? null,
        validationRules: request.validationRules ?? null
      };
      currentForm = { ...currentForm, fields: [...currentForm.fields, field] };
      return of(response(currentForm));
    });

    await TestBed.configureTestingModule({
      imports: [FieldEditorComponent],
      providers: [
        { provide: FormService, useValue: formService },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (name: string) => name === 'id' ? '3' : '7'
              }
            }
          }
        }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(FieldEditorComponent);
    fixture.detectChanges();
  });

  it('adds multiple fields of the same type with distinct persisted field names', () => {
    const addTextButton = fixture.nativeElement.querySelector('[aria-label="Add Text field"]') as HTMLButtonElement;

    addTextButton.click();
    fixture.detectChanges();
    addTextButton.click();
    fixture.detectChanges();

    expect(formService.addField).toHaveBeenCalledTimes(2);
    expect(formService.addField.calls.argsFor(0)[1].fieldName).toBe('textField');
    expect(formService.addField.calls.argsFor(1)[1].fieldName).toBe('textField2');
    expect(fixture.componentInstance.form()?.fields.length).toBe(4);
  });

  it('adds a toolbox field when it is dropped into the canvas', () => {
    const dropEvent = {
      previousContainer: {},
      container: {},
      previousIndex: 0,
      currentIndex: 2,
      item: { data: { kind: 'field-type', fieldType: 'Email' } }
    } as unknown as CdkDragDrop<FormField[]>;

    fixture.componentInstance.dropField(dropEvent);
    fixture.detectChanges();

    expect(formService.addField).toHaveBeenCalledWith(7, jasmine.objectContaining({
      fieldName: 'emailField',
      fieldType: 'Email'
    }));
    expect(fixture.componentInstance.form()?.fields.map((field) => field.fieldType)).toEqual([
      'Text',
      'Text',
      'Email'
    ]);
    expect(fixture.componentInstance.showFieldEditor).toBeTrue();
    expect(fixture.componentInstance.fieldForm.getRawValue()).toEqual({
      fieldName: '',
      label: '',
      fieldType: 'Email',
      isRequired: false,
      defaultValue: '',
      minLength: null,
      maxLength: null,
      min: null,
      max: null,
      pattern: '',
      optionsCsv: ''
    });
  });

  it('persists keyboard field reordering through the existing API', () => {
    const reorderedForm = {
      ...currentForm,
      fields: [
        { ...currentForm.fields[1], displayOrder: 1 },
        { ...currentForm.fields[0], displayOrder: 2 }
      ]
    };
    formService.reorderFields.and.returnValue(of(response(reorderedForm)));

    const moveDownButton = fixture.nativeElement.querySelector(
      '[aria-label="Move First field down"]'
    ) as HTMLButtonElement;
    moveDownButton.click();
    fixture.detectChanges();

    expect(formService.reorderFields).toHaveBeenCalledWith(7, [2, 1]);
    expect(fixture.componentInstance.form()?.fields.map((field) => field.id)).toEqual([2, 1]);
  });
});
