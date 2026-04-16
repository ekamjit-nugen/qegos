import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import {
  Appbar,
  Button,
  Card,
  Chip,
  Divider,
  HelperText,
  ProgressBar,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { useRouter } from 'expo-router';
import {
  useAvailableFormMappings,
  useFormDrafts,
  useSaveDraft,
  useDeleteDraft,
  useSubmitFormFill,
} from '@/hooks/useFormFill';
import type { AvailableFormMapping, FormField, FormDraft } from '@/types/formMapping';
import { FileUploadField, type FileUploadFieldValue } from '@/components/FileUploadField';

interface ParsedStep {
  id: string;
  title: string;
  description?: string;
  fields: FormField[];
}

function parseSchema(mapping: AvailableFormMapping): { steps: ParsedStep[] } {
  const schema = mapping.schema as {
    properties?: Record<string, { title?: string; description?: string; [k: string]: unknown }>;
    required?: string[];
  };
  const uiOrder = mapping.uiOrder ?? [];
  const properties = schema.properties ?? {};
  const required = new Set(schema.required ?? []);

  const fieldsByStep: Record<string, FormField[]> = {};
  const orphans: FormField[] = [];

  for (const [key, raw] of Object.entries(properties)) {
    if (uiOrder.includes(key)) {
      continue;
    } // step groups, not fields
    const p = raw as {
      title?: string;
      description?: string;
      'x-qegos'?: {
        widget?: FormField['widget'];
        step?: string;
        placeholder?: string;
        options?: Array<{ label: string; value: string }>;
      };
      enum?: string[];
      type?: string;
    };
    const widget: FormField['widget'] =
      p['x-qegos']?.widget ?? (p.enum ? 'select' : p.type === 'number' ? 'number' : 'text');
    const field: FormField = {
      key,
      label: p.title ?? key,
      widget,
      required: required.has(key),
      description: p.description,
      placeholder: p['x-qegos']?.placeholder,
      options:
        p['x-qegos']?.options ?? (p.enum ? p.enum.map((v) => ({ label: v, value: v })) : undefined),
      step: p['x-qegos']?.step,
    };
    if (field.step && uiOrder.includes(field.step)) {
      (fieldsByStep[field.step] ??= []).push(field);
    } else {
      orphans.push(field);
    }
  }

  const steps: ParsedStep[] = uiOrder.map((stepId, idx) => {
    const stepMeta = properties[stepId] as { title?: string; description?: string } | undefined;
    const stepFields = fieldsByStep[stepId] ?? [];
    if (idx === 0) {
      stepFields.unshift(...orphans);
    }
    return {
      id: stepId,
      title: stepMeta?.title ?? stepId,
      description: stepMeta?.description,
      fields: stepFields,
    };
  });

  if (steps.length === 0 && orphans.length > 0) {
    steps.push({ id: 'main', title: 'Details', fields: orphans });
  }
  return { steps };
}

export default function FileTaxScreen(): React.ReactNode {
  const theme = useTheme();
  const router = useRouter();
  const { data: mappings = [], isLoading } = useAvailableFormMappings();
  const { data: drafts = [] } = useFormDrafts();
  const saveDraft = useSaveDraft();
  const deleteDraft = useDeleteDraft();
  const submit = useSubmitFormFill();

  const [mapping, setMapping] = useState<AvailableFormMapping | null>(null);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [personalDetails, setPersonalDetails] = useState<{
    firstName?: string;
    lastName?: string;
    email?: string;
    mobile?: string;
    dateOfBirth?: string;
  }>({});
  const [draftId, setDraftId] = useState<string | undefined>();
  const [snackbar, setSnackbar] = useState<string>('');
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const parsed = useMemo(() => (mapping ? parseSchema(mapping) : { steps: [] }), [mapping]);
  const totalSteps = parsed.steps.length + 2; // + personal details + review

  function scheduleSave(nextAnswers?: Record<string, unknown>, nextStep?: number): void {
    if (!mapping) {
      return;
    }
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }
    saveTimer.current = setTimeout(() => {
      saveDraft.mutate(
        {
          mappingId: mapping.mappingId,
          versionNumber: mapping.version,
          financialYear: mapping.financialYear,
          currentStep: nextStep ?? currentStep,
          answers: nextAnswers ?? answers,
          personalDetails,
          serviceTitle: mapping.serviceTitle,
          servicePrice: mapping.servicePrice,
          formTitle: mapping.title,
        },
        {
          onSuccess: (res) => {
            setDraftId(res.draft._id);
            setLastSavedAt(Date.now());
          },
        },
      );
    }, 1500);
  }

  useEffect(() => {
    return () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    };
  }, []);

  function selectMapping(m: AvailableFormMapping): void {
    const existing = drafts.find(
      (d) => d.mappingId === m.mappingId && d.financialYear === m.financialYear,
    );
    if (existing) {
      Alert.alert('Resume Draft?', 'You have a saved draft for this service.', [
        { text: 'Start Fresh', onPress: () => startFresh(m) },
        { text: 'Resume', onPress: () => resumeDraft(m, existing) },
      ]);
    } else {
      startFresh(m);
    }
  }

  function startFresh(m: AvailableFormMapping): void {
    setMapping(m);
    setCurrentStep(0);
    setAnswers({});
    setPersonalDetails({});
    setDraftId(undefined);
  }

  function resumeDraft(m: AvailableFormMapping, d: FormDraft): void {
    setMapping(m);
    setCurrentStep(d.currentStep);
    setAnswers(d.answers);
    setPersonalDetails(d.personalDetails);
    setDraftId(d._id);
  }

  function handleFieldChange(key: string, value: unknown): void {
    const next = { ...answers, [key]: value };
    setAnswers(next);
    scheduleSave(next);
  }

  function handleNext(): void {
    const next = Math.min(currentStep + 1, totalSteps - 1);
    setCurrentStep(next);
    scheduleSave(undefined, next);
  }

  function handleBack(): void {
    setCurrentStep((s) => Math.max(0, s - 1));
  }

  function handleSubmit(): void {
    if (!mapping) {
      return;
    }
    if (!personalDetails.firstName || !personalDetails.lastName) {
      setSnackbar('First and last name are required');
      return;
    }
    submit.mutate(
      {
        mappingId: mapping.mappingId,
        versionNumber: mapping.version,
        financialYear: mapping.financialYear,
        personalDetails: {
          firstName: personalDetails.firstName,
          lastName: personalDetails.lastName,
          email: personalDetails.email,
          mobile: personalDetails.mobile,
          dateOfBirth: personalDetails.dateOfBirth,
        },
        answers,
        draftId,
      },
      {
        onSuccess: (result) => {
          router.replace(`/orders/${result.orderId}` as never);
        },
        onError: (err) => {
          setSnackbar(err.message || 'Failed to submit');
        },
      },
    );
  }

  // ─── Landing (no mapping selected) ──────────────────────────────────────────
  if (!mapping) {
    return (
      <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title="File Tax Return" />
        </Appbar.Header>
        <ScrollView contentContainerStyle={styles.content}>
          {drafts.length > 0 && (
            <>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Resume Drafts
              </Text>
              {drafts.map((d) => {
                const m = mappings.find((x) => x.mappingId === d.mappingId);
                return (
                  <Card key={d._id} style={styles.card}>
                    <Card.Content>
                      <Text variant="titleSmall">{d.serviceTitle}</Text>
                      <Text variant="bodySmall" style={styles.dim}>
                        FY {d.financialYear} · Step {d.currentStep + 1}
                      </Text>
                      <View style={styles.row}>
                        <Button
                          mode="contained"
                          onPress={() => m && resumeDraft(m, d)}
                          disabled={!m}
                          compact
                        >
                          Continue
                        </Button>
                        <Button mode="text" onPress={() => deleteDraft.mutate(d._id)} compact>
                          Discard
                        </Button>
                      </View>
                    </Card.Content>
                  </Card>
                );
              })}
              <Divider style={styles.divider} />
            </>
          )}

          <Text variant="titleMedium" style={styles.sectionTitle}>
            Choose a Service
          </Text>
          {isLoading ? (
            <Text>Loading…</Text>
          ) : mappings.length === 0 ? (
            <Text>No tax forms available right now.</Text>
          ) : (
            mappings.map((m) => (
              <Card key={m.mappingId} style={styles.card} onPress={() => selectMapping(m)}>
                <Card.Content>
                  <Text variant="titleSmall">{m.serviceTitle}</Text>
                  <Text variant="bodySmall" style={styles.dim}>
                    {m.serviceCategory} · FY {m.financialYear}
                  </Text>
                  {m.description && (
                    <Text variant="bodySmall" style={{ marginTop: 6 }}>
                      {m.description}
                    </Text>
                  )}
                  <Text variant="titleMedium" style={styles.price}>
                    ${(m.servicePrice / 100).toFixed(2)}
                  </Text>
                </Card.Content>
              </Card>
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  // ─── Stepper ────────────────────────────────────────────────────────────────
  const isPersonalDetailsStep = currentStep === parsed.steps.length;
  const isReviewStep = currentStep === parsed.steps.length + 1;
  const pct = Math.round(((currentStep + 1) / totalSteps) * 100);

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => setMapping(null)} />
        <Appbar.Content title={mapping.serviceTitle} subtitle={`FY ${mapping.financialYear}`} />
        <Appbar.Action icon="content-save" onPress={() => scheduleSave()} />
      </Appbar.Header>

      <View style={styles.progressBar}>
        <Text variant="labelSmall" style={styles.dim}>
          Step {currentStep + 1} of {totalSteps} · {pct}%{lastSavedAt && '  · Auto-saved'}
        </Text>
        <ProgressBar progress={pct / 100} color={theme.colors.primary} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {!isPersonalDetailsStep && !isReviewStep && parsed.steps[currentStep] && (
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleMedium">{parsed.steps[currentStep].title}</Text>
              {parsed.steps[currentStep].description && (
                <Text variant="bodySmall" style={styles.dim}>
                  {parsed.steps[currentStep].description}
                </Text>
              )}
              <View style={{ marginTop: 12 }}>
                {parsed.steps[currentStep].fields.map((field) => (
                  <View key={field.key} style={{ marginBottom: 12 }}>
                    {field.widget === 'select' || field.widget === 'radio' ? (
                      <>
                        <Text variant="bodyMedium" style={{ marginBottom: 6 }}>
                          {field.label}
                          {field.required && ' *'}
                        </Text>
                        <View style={styles.chipWrap}>
                          {(field.options ?? []).map((opt) => (
                            <Chip
                              key={opt.value}
                              selected={answers[field.key] === opt.value}
                              onPress={() => handleFieldChange(field.key, opt.value)}
                              style={styles.chip}
                            >
                              {opt.label}
                            </Chip>
                          ))}
                        </View>
                      </>
                    ) : field.widget === 'file_upload' ? (
                      <FileUploadField
                        label={field.label}
                        required={field.required}
                        description={field.description}
                        financialYear={mapping.financialYear}
                        category="tax_form_attachment"
                        value={answers[field.key] as FileUploadFieldValue | undefined}
                        onChange={(v) => handleFieldChange(field.key, v)}
                      />
                    ) : field.widget === 'checkbox' ? (
                      <Chip
                        selected={Boolean(answers[field.key])}
                        onPress={() => handleFieldChange(field.key, !answers[field.key])}
                      >
                        {field.label}
                      </Chip>
                    ) : (
                      <>
                        <TextInput
                          label={field.label + (field.required ? ' *' : '')}
                          value={String(answers[field.key] ?? '')}
                          onChangeText={(t) => handleFieldChange(field.key, t)}
                          keyboardType={
                            field.widget === 'number' || field.widget === 'currency'
                              ? 'numeric'
                              : 'default'
                          }
                          multiline={field.widget === 'textarea'}
                          mode="outlined"
                          placeholder={field.placeholder}
                        />
                        {field.description && (
                          <HelperText type="info">{field.description}</HelperText>
                        )}
                      </>
                    )}
                  </View>
                ))}
              </View>
            </Card.Content>
          </Card>
        )}

        {isPersonalDetailsStep && (
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleMedium">Personal Details</Text>
              <TextInput
                label="First Name *"
                value={personalDetails.firstName ?? ''}
                onChangeText={(v) => {
                  setPersonalDetails({ ...personalDetails, firstName: v });
                  scheduleSave();
                }}
                mode="outlined"
                style={styles.input}
              />
              <TextInput
                label="Last Name *"
                value={personalDetails.lastName ?? ''}
                onChangeText={(v) => {
                  setPersonalDetails({ ...personalDetails, lastName: v });
                  scheduleSave();
                }}
                mode="outlined"
                style={styles.input}
              />
              <TextInput
                label="Email"
                value={personalDetails.email ?? ''}
                onChangeText={(v) => {
                  setPersonalDetails({ ...personalDetails, email: v });
                  scheduleSave();
                }}
                mode="outlined"
                keyboardType="email-address"
                style={styles.input}
              />
              <TextInput
                label="Mobile"
                value={personalDetails.mobile ?? ''}
                onChangeText={(v) => {
                  setPersonalDetails({ ...personalDetails, mobile: v });
                  scheduleSave();
                }}
                mode="outlined"
                keyboardType="phone-pad"
                style={styles.input}
              />
              <TextInput
                label="Date of Birth (YYYY-MM-DD)"
                value={personalDetails.dateOfBirth ?? ''}
                onChangeText={(v) => {
                  setPersonalDetails({ ...personalDetails, dateOfBirth: v });
                  scheduleSave();
                }}
                mode="outlined"
                style={styles.input}
              />
            </Card.Content>
          </Card>
        )}

        {isReviewStep && (
          <Card style={styles.card}>
            <Card.Content>
              <Text variant="titleMedium">Review & Submit</Text>
              <Text variant="bodySmall" style={styles.dim}>
                Please review your answers before submitting.
              </Text>
              <Divider style={styles.divider} />
              <Text variant="titleSmall">Service</Text>
              <Text variant="bodyMedium">
                {mapping.serviceTitle} — ${(mapping.servicePrice / 100).toFixed(2)}
              </Text>
              <Divider style={styles.divider} />
              <Text variant="titleSmall">Personal Details</Text>
              <Text variant="bodyMedium">
                {personalDetails.firstName} {personalDetails.lastName}
              </Text>
              <Text variant="bodySmall" style={styles.dim}>
                {personalDetails.email} · {personalDetails.mobile}
              </Text>
              <Divider style={styles.divider} />
              <Text variant="titleSmall">Answers</Text>
              {Object.entries(answers).map(([k, v]) => (
                <View key={k} style={styles.reviewRow}>
                  <Text variant="bodySmall" style={{ flex: 1 }}>
                    {k}
                  </Text>
                  <Text variant="bodySmall" style={{ flex: 1, textAlign: 'right' }}>
                    {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                  </Text>
                </View>
              ))}
            </Card.Content>
          </Card>
        )}

        <View style={styles.nav}>
          {currentStep > 0 && (
            <Button mode="outlined" onPress={handleBack} style={styles.navBtn}>
              Back
            </Button>
          )}
          {!isReviewStep ? (
            <Button mode="contained" onPress={handleNext} style={styles.navBtn}>
              Next
            </Button>
          ) : (
            <Button
              mode="contained"
              onPress={handleSubmit}
              loading={submit.isPending}
              style={styles.navBtn}
            >
              Submit
            </Button>
          )}
        </View>
      </ScrollView>

      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar('')} duration={3000}>
        {snackbar}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontWeight: '600', marginBottom: 8, marginTop: 8 },
  card: { marginBottom: 12 },
  dim: { opacity: 0.6 },
  row: { flexDirection: 'row', gap: 8, marginTop: 10 },
  price: { marginTop: 10, fontWeight: '700' },
  divider: { marginVertical: 12 },
  progressBar: { paddingHorizontal: 16, paddingVertical: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { marginRight: 4 },
  input: { marginTop: 10 },
  reviewRow: { flexDirection: 'row', paddingVertical: 4 },
  nav: { flexDirection: 'row', gap: 12, marginTop: 8 },
  navBtn: { flex: 1 },
});
