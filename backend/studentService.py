"""Student services exposed from the compatibility route layer.

The implementation is kept in one tested service boundary while the route
migration is performed incrementally.
"""
from routes import _augment_student, _student_payment_totals, _payment_snapshot

__all__ = ["_augment_student", "_student_payment_totals", "_payment_snapshot"]
