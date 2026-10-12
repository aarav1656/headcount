import { View } from 'react-native'
import { color, radius, space } from '@/constants/theme'
import { Button } from './button'
import { Tally } from './tally'
import { Text } from './text'

type Props = { title: string; body: string; actionLabel?: string; onAction?: () => void; marks?: number }

/** An empty state that says what to do next. */
export function Empty({ title, body, actionLabel, onAction, marks = 0 }: Props) {
  return (
    <View
      style={{
        gap: space.md,
        padding: space.xl,
        borderWidth: 1,
        borderColor: color.rule,
        borderStyle: 'dashed',
        borderRadius: radius.lg,
      }}
    >
      {marks > 0 ? <Tally count={marks} height={20} /> : null}
      <Text variant="title">{title}</Text>
      <Text variant="small">{body}</Text>
      {actionLabel && onAction ? (
        <View style={{ alignSelf: 'flex-start', marginTop: space.xs }}>
          <Button label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </View>
  )
}

export function Notice({ tone, children }: { tone: 'warn' | 'danger' | 'success'; children: string }) {
  const c = tone === 'danger' ? color.danger : tone === 'warn' ? color.warn : color.success
  return (
    <View style={{ borderLeftWidth: 3, borderLeftColor: c, paddingLeft: space.md, paddingVertical: space.xs }}>
      <Text variant="small" style={{ color: c }}>
        {children}
      </Text>
    </View>
  )
}
