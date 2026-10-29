import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '../src/theme/ThemeProvider';
import { Button } from '../src/ui/Button';

const wrap = (ui: React.ReactElement) =>
  render(<ThemeProvider preference="light">{ui}</ThemeProvider>);

describe('Button', () => {
  it('exposes an accessible label and role', async () => {
    await wrap(<Button title="Enregistrer" onPress={() => {}} />);
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeTruthy();
  });

  it('awaits async actions and accepts taps again afterwards', async () => {
    const onPress = jest.fn(() => new Promise<void>((r) => setTimeout(r, 50)));
    await wrap(<Button title="Enregistrer" onPress={onPress} />);
    await fireEvent.press(screen.getByRole('button'));
    // A second tap while the action runs is ignored…
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
    // …and accepted once it has finished.
    await waitFor(() =>
      expect(screen.getByRole('button').props.accessibilityState).toMatchObject({ busy: false }),
    );
    await fireEvent.press(screen.getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  it('announces a busy state and ignores taps while loading', async () => {
    const onPress = jest.fn();
    await wrap(<Button title="Enregistrer" loading onPress={onPress} />);
    const button = screen.getByLabelText('Enregistrer');
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
  });

  it('does nothing when disabled', async () => {
    const onPress = jest.fn();
    await wrap(<Button title="Supprimer" disabled onPress={onPress} />);
    const button = screen.getByLabelText('Supprimer');
    await fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button.props.accessibilityState).toMatchObject({ disabled: true });
  });
});
