import { usePakshoFonts } from '../fonts';
import { colors, radii } from '../tokens';
import { AppText } from './AppText';

import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

type TextFieldProps = {
  label?: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  helper?: string;
  error?: string;
  keyboardType?: TextInputProps['keyboardType'];
  multiline?: boolean;
  autoFocus?: boolean;
};

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  helper,
  error,
  keyboardType,
  multiline = false,
  autoFocus = false,
}: TextFieldProps) {
  const fonts = usePakshoFonts();

  return (
    <View style={styles.wrap}>
      {label ? <AppText variant="label">{label}</AppText> : null}
      <TextInput
        accessibilityLabel={label}
        autoFocus={autoFocus}
        keyboardType={keyboardType}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.ink[400]}
        style={[
          styles.input,
          multiline && styles.multiline,
          error ? styles.inputError : null,
          fonts.regular ? { fontFamily: fonts.regular } : null,
        ]}
        textAlign="right"
        value={value}
      />
      {error ? (
        <AppText variant="caption" color={colors.danger[700]}>
          {error}
        </AppText>
      ) : helper ? (
        <AppText variant="caption" color={colors.ink[500]}>
          {helper}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.cream[300],
    backgroundColor: colors.white,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.ink[900],
    fontSize: 15,
    writingDirection: 'rtl',
  },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger[600], backgroundColor: colors.danger[50] },
});
