import { useState } from "react";

import { getCalendarFormValues, syncDateTimeFields } from "../../../services/calendarService.js";

import useCalendarState from "./useCalendarState.js";

export default function useCalendarDialogs(mode) {
  const { snapshot, actions, selectedEvent } = useCalendarState();
  const [values, setValues] = useState(() => getCalendarFormValues(mode, selectedEvent));
  function change(field, value) {
    setValues((previous) => {
      const next = { ...previous, [field]: value };
      return ["startDate", "endDate", "startDateStartTime", "startDateEndTime"].includes(field)
        ? syncDateTimeFields(next) : next;
    });
  }
  return {
    values,
    field: (name) => ({ value: values[name], onChange: (event) => change(name, event.target.value) }),
    saving: snapshot.isSavingEvent,
    eventId: snapshot.selectedEventId,
    dateKey: snapshot.selectedEventDateKey,
    close: actions.closeDialog,
    submit: () => actions.submit(values, mode),
    remove: actions.remove,
  };
}
