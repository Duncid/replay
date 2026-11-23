import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { PracticeFeedbackToast } from "@/components/PracticeFeedbackToast";
import { Button } from "@/components/ui/button";

const meta = {
  title: "Feedback/Practice feedback toast",
  component: PracticeFeedbackToast,
  args: { message: "Bien joué ! Garde ce rythme régulier et laisse résonner la dernière note.", event: 1, dismissLabel: "Dismiss feedback", durationMs: null },
  decorators: [Story => <div className="tune-practice relative min-h-80 w-full max-w-2xl p-3" data-highway-visible="true"><div className="ml-auto w-[440px] max-w-full"><Story /></div></div>],
  parameters: { docs: { description: { component: "Local practice feedback floats below the transport, without changing highway geometry. A 24px corner radius and the piano's translucent material keep it consistent with the playing surface. Instructions and results appear for 6–16 seconds according to text length; pending evaluation stays visible until a response arrives. Hover or keyboard focus pauses dismissal and grants a fresh reading interval afterward. Repeated identical evaluations reopen the toast. Changing the tune or section resets it. The close button dismisses early; announcements are polite and motion is removed under reduced-motion preferences. Reference states stay visible; use Lifecycle to exercise production timing." } } },
} satisfies Meta<typeof PracticeFeedbackToast>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Evaluation: Story = {};
export const Sending: Story = { args: { pending: true, message: "Envoi de votre interprétation…" } };
export const LongFeedback: Story = { args: { message: "La mélodie est bien en place. Sur la deuxième phrase, prends le temps de tenir chaque note jusqu'à la suivante. Écoute une nouvelle fois la démonstration, puis rejoue ce passage en gardant une pulsation régulière. Tu peux recommencer aussi souvent que tu le souhaites." } };
export const Lifecycle: Story = {
  args: { durationMs: undefined },
  render: function Example(args) {
    const [event, setEvent] = useState(1);
    const [section, setSection] = useState(1);
    const [pending, setPending] = useState(false);
    return <>
      <div className="mb-4 flex flex-wrap gap-2">
        <Button onClick={() => { setPending(false); setEvent(value => value + 1); }}>Show feedback again</Button>
        <Button variant="outline" onClick={() => setPending(true)}>Send performance</Button>
        <Button variant="outline" onClick={() => { setPending(false); setSection(value => value + 1); }}>Next section</Button>
      </div>
      <PracticeFeedbackToast {...args} key={section} event={event} pending={pending} message={pending ? "Sending performance…" : args.message} />
    </>;
  },
};
